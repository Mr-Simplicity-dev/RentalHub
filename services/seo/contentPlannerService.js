const {
  fail,
  text,
  id,
  hash,
  canonicalUrl
} = require('./core');
function createContentPlanner({
  store,
  Blog,
  audit = async () => {}
}) {
  const ready = () => {
    if (Blog.db?.readyState !== 1) fail(503, 'BLOG_DATABASE_UNAVAILABLE', 'The article database is unavailable. No article was published.');
  };
  const revision = row => hash([row.id, row.title, row.cluster, row.keywords, row.intent, row.target_url, row.outline, row.content]);
  const list = async () => (await store.query('SELECT * FROM seo_content_plans ORDER BY updated_at DESC LIMIT 100')).rows.map(row => ({
    ...row,
    revision: revision(row)
  }));
  const saveInternal = async (input, actor) => {
    const title = text(input.title, 200),
      cluster = text(input.cluster, 150);
    if (!title || !cluster) fail(400, 'CONTENT_TITLE_REQUIRED', 'Enter a title and topic group.');
    if (!['informational', 'commercial', 'transactional', 'local'].includes(input.intent || 'informational')) fail(400, 'INVALID_CONTENT_INTENT', 'Choose a supported search intent.');
    const keywords = Array.isArray(input.keywords) ? [...new Set(input.keywords.map(k => text(k, 200)).filter(Boolean))].slice(0, 30) : [];
    const target = input.target_url ? canonicalUrl(input.target_url) : null,
      outline = text(input.outline, 20000),
      content = text(input.content, 100000);
    if (!input.id) {
      const key = id();
      return (await store.query('INSERT INTO seo_content_plans(id,title,cluster,keywords,intent,target_url,outline,content,created_by) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9) RETURNING *', [key, title, cluster, JSON.stringify(keywords), input.intent || 'informational', target, outline, content, actor.id])).rows[0];
    }
    const result = await store.query("UPDATE seo_content_plans SET title=$2,cluster=$3,keywords=$4::jsonb,intent=$5,target_url=$6,outline=$7,content=$8,status='draft',updated_at=NOW() WHERE id=$1 AND status IN ('draft','ready') RETURNING *", [input.id, title, cluster, JSON.stringify(keywords), input.intent || 'informational', target, outline, content]);
    if (!result.rows.length) fail(409, 'CONTENT_NOT_EDITABLE', 'Published or publishing articles cannot be edited through this draft form.');
    await audit({
      actorId: actor.id,
      action: 'SEO_CONTENT_DRAFT_SAVED',
      targetType: 'seo'
    });
    return result.rows[0];
  };
  const suggestions = async () => {
    const keywords = (await store.query("SELECT keyword,group_name,target_url FROM seo_keywords WHERE is_active ORDER BY group_name,keyword LIMIT 200")).rows,
      groups = new Map();
    for (const k of keywords) {
      const group = k.group_name || 'Ungrouped';
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(k.keyword);
    }
    return {
      source: 'saved_keyword_template',
      generated_by_ai: false,
      groups: [...groups].map(([cluster, keywords]) => ({
        cluster,
        keywords,
        title: cluster === 'Ungrouped' ? 'Choose a focused rental topic' : cluster,
        outline: 'Reader question\nVerified facts and current listings\nPractical steps\nCosts and limits, where verified\nUseful next action',
        note: 'Planning template only. A person must write and check the article.'
      }))
    };
  };
  const publish = async (input, actor) => {
    if (actor.user_type !== 'super_admin') fail(403, 'SUPER_ADMIN_REQUIRED', 'Super Admin access is required.');
    if (input.confirm !== true || input.facts_checked !== true || input.originality_checked !== true || text(input.approval_note, 1000).length < 10) fail(400, 'CONTENT_APPROVAL_REQUIRED', 'Confirm publication, fact checks and originality, and add an approval note.');
    ready();
    const plan = await store.transaction(async tx => {
      const row = (await tx.query('SELECT * FROM seo_content_plans WHERE id=$1 FOR UPDATE', [input.id])).rows[0];
      if (!row) fail(404, 'CONTENT_NOT_FOUND', 'Draft not found.');
      if (row.status === 'published') return row;
      if (input.expected_revision !== revision(row)) fail(409, 'CONTENT_CHANGED', 'This draft changed. Open and review its latest saved version before publishing.');
      if (row.status === 'publishing' && Date.now() - new Date(row.updated_at).getTime() < 600000) fail(409, 'CONTENT_PUBLISHING', 'This article is already being published.');
      if (row.content.trim().length < 200) fail(400, 'CONTENT_TOO_SHORT', 'Write a useful, checked article before publication.');
      await tx.query("UPDATE seo_content_plans SET status='publishing',approval_note=$2,approved_by=$3,approved_at=NOW(),updated_at=NOW() WHERE id=$1", [row.id, text(input.approval_note, 1000), actor.id]);
      return row;
    });
    if (plan.status === 'published') return plan;
    try {
      const slug = text(plan.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), 120) + '-' + plan.id.slice(0, 8);
      const blog = await Blog.findOneAndUpdate({
        contentPlanId: plan.id
      }, {
        $setOnInsert: {
          contentPlanId: plan.id,
          slug
        },
        $set: {
          title: plan.title,
          content: plan.content,
          keywords: plan.keywords,
          status: 'published',
          approvedBy: actor.id,
          publishedAt: new Date()
        }
      }, {
        upsert: true,
        new: true,
        runValidators: true
      });
      await store.query("UPDATE seo_content_plans SET status='published',blog_id=$2,updated_at=NOW() WHERE id=$1", [plan.id, String(blog._id)]);
      require('../../config/utils/sitemapGenerator').invalidateSitemap();
      await audit({
        actorId: actor.id,
        action: 'SEO_CONTENT_PUBLISHED',
        targetType: 'seo'
      });
      return {
        published: true,
        url: '/blog/' + blog.slug
      };
    } catch (e) {
      await store.query("UPDATE seo_content_plans SET status='ready',updated_at=NOW() WHERE id=$1 AND status='publishing'", [plan.id]);
      fail(503, 'CONTENT_PUBLICATION_UNCONFIRMED', 'Publication could not be confirmed. Retry this same draft; it will not create a second article.');
    }
  };
  const legacyDrafts = async () => {
    ready();
    return Blog.find({
      status: 'draft',
      contentPlanId: {
        $exists: false
      }
    }).select('_id title createdAt').sort({
      createdAt: -1
    }).limit(50).lean();
  };
  const importDraft = async (input, actor) => {
    ready();
    if (!/^[a-f0-9]{24}$/i.test(String(input.blog_id))) fail(400, 'INVALID_DRAFT', 'Choose an existing article draft.');
    const planId = require('uuid').v5('rentalhub:blog:' + input.blog_id, require('uuid').v5.URL),
      blog = await Blog.findOne({
        _id: input.blog_id,
        status: 'draft',
        $or: [{
          contentPlanId: {
            $exists: false
          }
        }, {
          contentPlanId: planId
        }]
      }).lean();
    if (!blog) fail(404, 'DRAFT_NOT_FOUND', 'This draft is unavailable or was already changed.');
    await store.query("INSERT INTO seo_content_plans(id,title,cluster,keywords,content,created_by) VALUES($1,$2,'Imported existing draft',$3::jsonb,$4,$5) ON CONFLICT(id) DO NOTHING", [planId, text(blog.title, 200), JSON.stringify(blog.keywords || []), text(blog.content, 100000), actor.id]);
    const linked = await Blog.updateOne({
      _id: blog._id,
      status: 'draft',
      $or: [{
        contentPlanId: {
          $exists: false
        }
      }, {
        contentPlanId: planId
      }]
    }, {
      $set: {
        contentPlanId: planId
      }
    });
    if (!linked.matchedCount) fail(409, 'DRAFT_CHANGED', 'The draft changed. Reload before reviewing.');
    await audit({
      actorId: actor.id,
      action: 'SEO_EXISTING_DRAFT_IMPORTED',
      targetType: 'seo'
    });
    return {
      id: planId,
      imported: true
    };
  };
  return {
    list,
    save: async (input, actor) => {
      const row = await saveInternal(input, actor);
      return {
        ...row,
        revision: revision(row)
      };
    },
    suggestions,
    publish,
    legacyDrafts,
    importDraft
  };
}
module.exports = {
  createContentPlanner
};
