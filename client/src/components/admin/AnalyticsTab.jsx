import React, { useEffect, useState } from "react";
import api from "../../services/api";

export default function AnalyticsTab() {

  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {

    loadAnalytics();

  }, []);

  const loadAnalytics = async () => {

    const res = await api.get("/super/analytics");

    setAnalytics(res.data.data);

  };

  if (!analytics) return <p>Loading...</p>;

  return (

    <div className="grid grid-cols-4 gap-4">

      <div className="card">
        <h3>Total Users</h3>
        <p>{analytics.totalUsers}</p>
      </div>

      <div className="card">
        <h3>Total Properties</h3>
        <p>{analytics.totalProperties}</p>
      </div>

      <div className="card">
        <h3>Applications</h3>
        <p>{analytics.totalApplications}</p>
      </div>

      <div className="card">
        <h3>Revenue</h3>
        <p>₦{analytics.totalRevenue}</p>
      </div>

    </div>

  );
}