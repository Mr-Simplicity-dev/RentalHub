const AdminTabs = ({ tabs, tab, loadTab }) => {
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {tabs.map((name) => (
        <button
          key={name}
          className={`btn ${tab === name ? "btn-primary" : "btn-outline"}`}
          onClick={() => loadTab(name)}
        >
          {name.charAt(0).toUpperCase() + name.slice(1)}
        </button>
      ))}
    </div>
  );
};

export default AdminTabs;