const db = require('../middleware/database');
const nigeriaLocations = require('../../data/nigeriaLocations');
const slugify = require('./slugify');
const { getFrontendUrl } = require('./frontendUrl');

const ACTIVE_PROPERTY_FILTER = `p.is_verified = TRUE AND p.is_available = TRUE
 AND (p.expires_at IS NULL OR p.expires_at > CURRENT_TIMESTAMP)
 AND (NOT EXISTS(SELECT 1 FROM feature_flags f WHERE f.key='require_property_ownership_verification' AND f.enabled=TRUE)
 OR p.ownership_verification_status='verified'
 OR p.created_at <= (SELECT ownership_gate_enabled_at FROM feature_flags WHERE key='require_property_ownership_verification'))`;
const SQL_SLUG = column => `regexp_replace(regexp_replace(regexp_replace(lower(trim(coalesce(${column},''))), '/', ' ', 'g'), '\\s+', '-', 'g'), '[^a-z0-9_-]', '', 'g')`;
const normalizedSlug = column => `regexp_replace(${SQL_SLUG(column)}, '-{2,}', '-', 'g')`;
const query = async (sql, args = []) => {
  if (db.isMockActive?.()) throw Object.assign(new Error('SEO needs the real database.'), { code: 'SEO_DATABASE_UNAVAILABLE' });
  const result = await db.query(sql, args);
  if (db.isMockActive?.()) throw Object.assign(new Error('SEO needs the real database.'), { code: 'SEO_DATABASE_UNAVAILABLE' });
  return result;
};
const fetchStates = async () => {
  const { rows } = await query('SELECT id,state_name,state_code FROM states ORDER BY state_name');
  return rows.map(state => ({ ...state, state_slug: slugify(state.state_name), dataset: nigeriaLocations.find(item => [item.state,item.displayName,item.slug].some(name => slugify(name) === slugify(state.state_name) || slugify(name) === slugify(state.state_code))) }));
};
const scopeWhere = ({ stateId, lgaSlug, citySlug, areaSlug }) => {
  const args = [stateId];
  let where = `p.state_id=$1 AND ${ACTIVE_PROPERTY_FILTER}`;
  if (lgaSlug) { args.push(lgaSlug); where += ` AND ${normalizedSlug("COALESCE(NULLIF(TRIM(p.lga_name),''),p.city)")}=$2`; }
  if (citySlug && areaSlug) { args.push(citySlug,areaSlug); where += ` AND ${normalizedSlug("COALESCE(NULLIF(TRIM(p.city),''),s.state_name)")}=$2 AND ${normalizedSlug("COALESCE(NULLIF(TRIM(p.area),''),NULLIF(TRIM(p.city),''),s.state_name)")}=$3`; }
  return { where, args };
};
const fetchInventory = async scope => {
  const { where, args } = scopeWhere(scope);
  const stats = (await query(`SELECT COUNT(*)::int AS total_properties,
 COUNT(*) FILTER(WHERE p.payment_frequency='yearly' AND p.rent_amount>0)::int AS sample_size,
 ROUND((AVG(p.rent_amount) FILTER(WHERE p.payment_frequency='yearly' AND p.rent_amount>0))::numeric,0) AS avg_rent,
 MIN(p.rent_amount) FILTER(WHERE p.payment_frequency='yearly' AND p.rent_amount>0) AS min_rent,
 MAX(p.rent_amount) FILTER(WHERE p.payment_frequency='yearly' AND p.rent_amount>0) AS max_rent,
 MAX(p.updated_at) AS updated_at FROM properties p JOIN states s ON s.id=p.state_id WHERE ${where}`,args)).rows[0] || {};
  const rows = (await query(`SELECT p.id,p.title,p.property_type,p.rent_amount,p.payment_frequency,p.city,p.area,p.bedrooms,p.bathrooms,s.state_name,
 (SELECT photo_url FROM property_photos ph WHERE ph.property_id=p.id ORDER BY ph.is_primary DESC,ph.upload_order,ph.id LIMIT 1) AS primary_photo
 FROM properties p JOIN states s ON s.id=p.state_id WHERE ${where} ORDER BY p.created_at DESC LIMIT 12`,args)).rows;
  return { stats: { ...stats, price_basis: 'yearly', methodology: 'Unweighted mean of positive yearly asking rents on currently available, verified listings. Asking prices are not completed rents.', top_property_types: [...new Set(rows.map(p => p.property_type).filter(Boolean))] }, properties: rows.map(p => ({...p,url:`/properties/${p.id}`})) };
};
const fetchAreaRows = async ({stateId=null,limit=1000,citySlug=null,areaSlug=null}={}) => {
 const city="COALESCE(NULLIF(TRIM(p.city),''),s.state_name)",area="COALESCE(NULLIF(TRIM(p.area),''),NULLIF(TRIM(p.city),''),s.state_name)";
 const rows=(await query(`SELECT p.state_id,s.state_name,${city} AS city_name,${area} AS area_name,COUNT(*)::int AS property_count,MAX(p.updated_at) AS updated_at FROM properties p JOIN states s ON s.id=p.state_id WHERE ${ACTIVE_PROPERTY_FILTER} AND ($1::integer IS NULL OR p.state_id=$1) AND ($3::text IS NULL OR ${normalizedSlug(city)}=$3) AND ($4::text IS NULL OR ${normalizedSlug(area)}=$4) GROUP BY p.state_id,s.state_name,city_name,area_name ORDER BY property_count DESC,state_name,city_name,area_name LIMIT $2`,[stateId,Math.min(Number(limit)||1000,50000),citySlug,areaSlug])).rows;
 return rows.map(row=>({...row,state_slug:slugify(row.state_name),city_slug:slugify(row.city_name),area_slug:slugify(row.area_name),url:`/areas/${slugify(row.state_name)}/${slugify(row.city_name)}/${slugify(row.area_name)}`}));
};
const contentFor = (label, stats) => ({
  overview: Number(stats.total_properties)>0 ? `Compare ${Number(stats.total_properties)} available verified listing(s) in ${label}. Check each listing for its rent period, features, photos and availability.` : `There are no available verified listings for ${label} at present. Browse another location or submit a property request.`,
  marketSummary: 'Compare the full cost and the rent period. Read the property description and arrange a viewing through RentalHub before making a decision.',
  strategy: 'Check whether a home meets your needs. Use the in-platform enquiry and support tools, and review the tenancy terms before applying.'
});
const faqFor = (label,stats) => [{ question:`Are there homes available in ${label}?`,answer:Number(stats.total_properties)>0?`This page currently has ${Number(stats.total_properties)} available verified listing(s). Availability can change; open a listing to check its latest details.`:'There are no available verified listings on this page right now.' },{question:'What does the asking-rent figure mean?',answer:`It uses ${Number(stats.sample_size)||0} positive yearly asking rent(s) from available verified listings on this page. It is not a quote, valuation or record of agreed rents. Different property types may have different costs.`}];
const pageData = (label,canonical,inventory) => ({
  seo:{title:`Homes for rent in ${label} | Amana RentalHub NG`,description:`Browse current verified rental listings in ${label}. Compare property details and yearly asking rents where a sample is available.`,keywords:[`homes for rent in ${label}`,`apartments for rent in ${label}`]},
  canonical,indexable:Number(inventory.stats.total_properties)>0 && inventory.properties.length>0,
  indexability_reason:Number(inventory.stats.total_properties)>0?'available_verified_inventory':'no_available_verified_inventory',
  ...inventory,content:contentFor(label,inventory.stats),faq:faqFor(label,inventory.stats),keyword_targets:[]
});
const getLocationPageData = async ({stateSlug,lgaSlug=null}) => {
  const states=await fetchStates(),state=states.find(s=>[s.state_slug,slugify(s.state_code)].includes(stateSlug));
  if(!state)return null;
  const lga=lgaSlug?(state.dataset?.lgas||[]).find(name=>slugify(name)===lgaSlug):null;
  if(lgaSlug&&!lga)return null;
  const inventory=await fetchInventory({stateId:state.id,lgaSlug:lga?slugify(lga):null});
  const areas=await fetchAreaRows({stateId:state.id,limit:12});
  const base=getFrontendUrl(),canonical=`${base}/nigeria/${state.state_slug}${lga?'/'+slugify(lga):''}`;
  return {...pageData(lga?`${lga}, ${state.state_name}`:state.state_name,canonical,inventory),page_type:lga?'lga':'state',location:{state:state.state_name,stateSlug:state.state_slug,lga,lgaSlug:lga?slugify(lga):null},links:{areas:areas.map(a=>({name:a.area_name,url:a.url,property_count:a.property_count})),lgas:(state.dataset?.lgas||[]).map(name=>({name,url:`/nigeria/${state.state_slug}/${slugify(name)}`})),statePage:lga?{name:state.state_name,url:`/nigeria/${state.state_slug}`}:null}};
};
const getAreaPageData = async ({stateSlug,citySlug,areaSlug}) => {
  const state=(await fetchStates()).find(s=>s.state_slug===stateSlug);if(!state)return null;
  const exactAreas=await fetchAreaRows({stateId:state.id,citySlug,areaSlug,limit:1});const area=exactAreas[0];if(!area)return null;const areas=await fetchAreaRows({stateId:state.id,citySlug,limit:13});
  const inventory=await fetchInventory({stateId:state.id,citySlug,areaSlug});
  return {...pageData(`${area.area_name}, ${state.state_name}`,getFrontendUrl()+area.url,inventory),page_type:'area',area:{state:state.state_name,stateSlug,city:area.city_name,citySlug,name:area.area_name,areaSlug},links:{statePage:{name:state.state_name,url:`/nigeria/${state.state_slug}`},nearbyAreas:areas.filter(a=>a.url!==area.url).slice(0,12).map(a=>({name:a.area_name,url:a.url,property_count:a.property_count}))}};
};
const getNigeriaDirectoryPage = async () => {
  const states=await fetchStates(),areas=await fetchAreaRows({limit:20});
  return {seo:{title:'Find rental homes in Nigeria | Amana RentalHub NG',description:'Browse Nigerian states and areas to find current verified rental listings.'},canonical:getFrontendUrl()+'/nigeria',indexable:areas.length>0,states:states.map(s=>({id:s.id,state_name:s.state_name,state_slug:s.state_slug,lga_count:s.dataset?.lgas?.length||0,url:`/nigeria/${s.state_slug}`})),popular_areas:areas};
};
const getSitemapUrls = async ({withMetadata=false}={}) => {
  const base=getFrontendUrl(),entries=['/','/properties','/landlord-guide'].map(url=>({url:base+url}));
  const properties=(await query(`SELECT p.id,p.state_id,p.lga_name,p.city,p.area,p.updated_at,s.state_name FROM properties p JOIN states s ON s.id=p.state_id WHERE ${ACTIVE_PROPERTY_FILTER} ORDER BY p.id`)).rows;
  if(properties.length)entries.push({url:base+'/nigeria'});
  const locations=new Map();
  for(const p of properties){
    entries.push({url:`${base}/properties/${p.id}`,lastmod:p.updated_at});
    const clean=value=>String(value||'').trim();const state=slugify(p.state_name),lga=slugify(clean(p.lga_name)||clean(p.city)),city=slugify(clean(p.city)||p.state_name),area=slugify(clean(p.area)||clean(p.city)||p.state_name);
    for(const route of [`/nigeria/${state}`,...(lga&&nigeriaLocations.some(s=>slugify(s.displayName||s.state)===state&&(s.lgas||[]).some(n=>slugify(n)===lga))?[`/nigeria/${state}/${lga}`]:[]),`/areas/${state}/${city}/${area}`]){
      const old=locations.get(route);if(!old||new Date(p.updated_at)>new Date(old))locations.set(route,p.updated_at);
    }
  }
  for(const [route,lastmod]of locations)entries.push({url:base+route,lastmod});
  const Blog=require('../../models/Blog');
  if(Blog.db.readyState===1){const blogs=await Blog.find({$or:[{status:'published'},{status:{$exists:false}}]}).select('slug updatedAt publishedAt createdAt').lean();for(const blog of blogs)if(/^[a-z0-9-]{1,160}$/.test(blog.slug||''))entries.push({url:base+'/blog/'+blog.slug,lastmod:blog.updatedAt||blog.publishedAt||blog.createdAt});}
  return withMetadata?entries:entries.map(e=>e.url);
};
module.exports={getAreaPageData,getLocationPageData,getNigeriaDirectoryPage,getSitemapUrls,ACTIVE_PROPERTY_FILTER};
