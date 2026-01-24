import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { propertyService } from '../services/propertyService';
import PropertyList from '../components/properties/PropertyList';
import PropertyFilters from '../components/properties/PropertyFilters';
import { toast } from 'react-toastify';
import ReactPaginate from 'react-paginate';
import { useTranslation } from 'react-i18next';

const Properties = () => {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();

  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
  });
  const [filters, setFilters] = useState({});
  const [savedPropertyIds, setSavedPropertyIds] = useState([]);

  useEffect(() => {
    // Get initial filters from URL
    const initialFilters = {};
    searchParams.forEach((value, key) => {
      initialFilters[key] = value;
    });
    setFilters(initialFilters);
    loadProperties(initialFilters);
  }, []);

  const loadProperties = async (filterParams = {}, page = 1) => {
    setLoading(true);
    try {
      const response = await propertyService.searchProperties({
        ...filterParams,
        page,
        limit: pagination.limit,
      });

      if (response.success) {
        setProperties(response.data);
        setPagination(response.pagination);
      }
    } catch (error) {
      toast.error(t('properties.load_failed'));
      console.error('Error loading properties:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    loadProperties(newFilters, 1);
  };

  const handlePageChange = (selectedPage) => {
    const newPage = selectedPage.selected + 1;
    loadProperties(filters, newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveProperty = async (propertyId) => {
    try {
      if (savedPropertyIds.includes(propertyId)) {
        await propertyService.unsaveProperty(propertyId);
        setSavedPropertyIds(savedPropertyIds.filter(id => id !== propertyId));
        toast.success(t('properties.removed_favorite'));
      } else {
        await propertyService.saveProperty(propertyId);
        setSavedPropertyIds([...savedPropertyIds, propertyId]);
        toast.success(t('properties.saved_favorite'));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('properties.save_failed'));
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold mb-6">
          {t('properties.title')}
        </h1>

        {/* Filters */}
        <PropertyFilters
          onFilterChange={handleFilterChange}
          initialFilters={filters}
        />

        {/* Results Count */}
        <div className="mb-4">
          <p className="text-gray-600">
            {loading
              ? t('properties.loading')
              : t('properties.found', { count: pagination.total })}
          </p>
        </div>

        {/* Property List */}
        <PropertyList
          properties={properties}
          loading={loading}
          onSave={handleSaveProperty}
          savedPropertyIds={savedPropertyIds}
        />

        {/* Pagination */}
        {!loading && pagination.total > pagination.limit && (
          <div className="mt-8 flex justify-center">
            <ReactPaginate
              previousLabel={t('properties.prev')}
              nextLabel={t('properties.next')}
              pageCount={Math.ceil(pagination.total / pagination.limit)}
              onPageChange={handlePageChange}
              containerClassName="flex space-x-2"
              pageClassName="px-4 py-2 border rounded hover:bg-gray-100"
              activeClassName="bg-primary-600 text-white hover:bg-primary-700"
              previousClassName="px-4 py-2 border rounded hover:bg-gray-100"
              nextClassName="px-4 py-2 border rounded hover:bg-gray-100"
              disabledClassName="opacity-50 cursor-not-allowed"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Properties;
