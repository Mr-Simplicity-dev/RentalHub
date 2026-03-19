import { useEffect, useState } from "react";

export default function SeoDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/admin/seo")
      .then(res => res.json())
      .then(setData);
  }, []);

  if (!data) return <p>Loading...</p>;

  return (
    <div>
      <h1>SEO Dashboard</h1>

      <p>Total Blogs: {data.totalBlogs}</p>

      <h2>Rankings</h2>
      {data.rankings.map((r, i) => (
        <div key={i}>
          {r.keyword} → #{r.position}
        </div>
      ))}
    </div>
  );
}