import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";

export default function LocationPage() {
  const { stateSlug, lgaSlug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    const url = lgaSlug
      ? `/nigeria/${stateSlug}/${lgaSlug}`
      : `/nigeria/${stateSlug}`;

    fetch(url)
      .then(res => res.json())
      .then(resData => {
        setData(resData);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching location:", err);
        setLoading(false);
      });

  }, [stateSlug, lgaSlug]);

  if (loading) return <p>Loading properties...</p>;
  if (!data) return <p>No data found</p>;

  return (
    <>
      {/* 🔥 SEO META TAGS */}
      <Helmet>
        <title>{data.seo.title}</title>
        <meta name="description" content={data.seo.description} />
        <link rel="canonical" href={data.canonical} />

        {/* ✅ INDEXING */}
        <meta name="robots" content="index, follow" />
        <meta name="googlebot" content="index, follow" />

        {/* ✅ LOCATION SCHEMA */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Residence",
            name: data.seo.title,
            description: data.seo.description,
            address: {
              "@type": "PostalAddress",
              addressLocality: data.location.lga || data.location.state,
              addressCountry: "NG"
            }
          })}
        </script>

        {/* ✅ FAQ SCHEMA */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: `What is the cost of rent in ${data.location.state}?`,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Rental prices vary depending on the area and property type."
                }
              },
              {
                "@type": "Question",
                name: `Where can I find cheap houses in ${data.location.state}?`,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "You can find affordable houses in multiple areas listed on this page."
                }
              }
            ]
          })}
        </script>

        {/* ✅ BREADCRUMB SCHEMA */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: "https://rentalhub.com.ng"
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "Nigeria",
                item: "https://rentalhub.com.ng/nigeria"
              },
              {
                "@type": "ListItem",
                position: 3,
                name: data.location.state,
                item: `https://rentalhub.com.ng/nigeria/${data.location.stateSlug}`
              }
            ]
          })}
        </script>
      </Helmet>

      <div style={{ padding: "20px" }}>

        {/* 🔥 BREADCRUMBS UI */}
        <div style={{ marginBottom: "15px" }}>
          <Link to="/">Home</Link> → 
          <Link to="/nigeria"> Nigeria</Link> → 
          <Link to={`/nigeria/${data.location.stateSlug}`}>
            {" "}{data.location.state}
          </Link>
          {data.location.lga && <> → {data.location.lga}</>}
        </div>

        {/* 🔥 TITLE */}
        <h1>{data.seo.title}</h1>

        {/* 🔥 DESCRIPTION */}
        <p>{data.seo.description}</p>

        {/* 🔥 CONTENT */}
        <div style={{ marginTop: "20px" }}>
          <h2>
            About {data.location.lga
              ? `${data.location.lga}, ${data.location.state}`
              : data.location.state}
          </h2>
          <p>{data.content}</p>
        </div>

        {/* 🔥 INTERNAL LINKS */}
        {data.links?.statePage && (
          <div style={{ marginTop: "30px" }}>
            <h3>Explore {data.location.state}</h3>
            <Link to={data.links.statePage.url}>
              Houses for rent in {data.location.state}
            </Link>
          </div>
        )}

        <div style={{ marginTop: "30px" }}>
          <h3>Areas in {data.location.state}</h3>
          {data.links?.lgas?.map(lga => (
            <Link key={lga.url} to={lga.url} style={{ display: "block" }}>
              Houses for rent in {lga.name}
            </Link>
          ))}
        </div>

        <div style={{ marginTop: "30px" }}>
          <h3>Nearby Areas</h3>
          {data.links?.nearby?.map(lga => (
            <Link key={lga.url} to={lga.url} style={{ display: "block" }}>
              Apartments in {lga.name}
            </Link>
          ))}
        </div>

        {/* 🔥 BLOG LINK */}
        {data.blog && (
          <div style={{ marginTop: "40px" }}>
            <h2>Rental Guide</h2>
            <Link to={`/blog/${data.blog.slug}`}>
              {data.blog.title}
            </Link>
          </div>
        )}

        {/* 🔥 PROPERTIES */}
        <div style={{ marginTop: "40px" }}>
          <h2>Available Properties</h2>

          {data.properties?.length === 0 ? (
            <p>No properties available.</p>
          ) : (
            data.properties.map((p) => (
              <div key={p._id} style={{ border: "1px solid #ddd", padding: "10px", marginBottom: "10px" }}>
                <h3>{p.title}</h3>
                <p>{p.description}</p>
                <p><strong>₦{p.price}</strong></p>

                {/* ✅ PROPERTY SCHEMA */}
                <script type="application/ld+json">
                  {JSON.stringify({
                    "@context": "https://schema.org",
                    "@type": "Product",
                    name: p.title,
                    description: p.description,
                    offers: {
                      "@type": "Offer",
                      price: p.price,
                      priceCurrency: "NGN"
                    }
                  })}
                </script>

              </div>
            ))
          )}
        </div>

      </div>
    </>
  );
}