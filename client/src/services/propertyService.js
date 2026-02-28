import api from './api';

export const propertyService = {
  // Get all states
  getStates: async () => {
    const response = await api.get('/properties/states');
    return response.data;
  },

  // Browse properties
  browseProperties: async (page = 1, limit = 20) => {
    const response = await api.get('/properties/browse', {
      params: { page, limit }
    });
    return response.data;
  },

  // Search properties
  searchProperties: async (filters) => {
    const response = await api.get('/properties/search', { params: filters });
    return response.data;
  },

  // Get featured properties
  getFeaturedProperties: async (limit = 10) => {
    const response = await api.get('/properties/featured', { params: { limit } });
    return response.data;
  },

  // Get property by ID
  getPropertyById: async (id) => {
    const response = await api.get(`/properties/${id}`);
    return response.data;
  },

  // Get full property details (requires property unlock payment)
  getFullPropertyDetails: async (id) => {
    const response = await api.get(`/properties/${id}/details`);
    return response.data;
  },

  // Create property
  createProperty: async (propertyData) => {
    const response = await api.post('/properties', propertyData);
    return response.data;
  },

  // Update property
  updateProperty: async (id, propertyData) => {
    const response = await api.put(`/properties/${id}`, propertyData);
    return response.data;
  },

  // Delete property
  deleteProperty: async (id) => {
    const response = await api.delete(`/properties/${id}`);
    return response.data;
  },

  // Upload property photos
  uploadPhotos: async (propertyId, files) => {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('photos', file);
    });
    const response = await api.post(`/properties/${propertyId}/photos`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  // Delete property photo
  deletePhoto: async (propertyId, photoId) => {
    const response = await api.delete(`/properties/${propertyId}/photos/${photoId}`);
    return response.data;
  },

  // Get my properties (landlord)
  getMyProperties: async (params) => {
    const response = await api.get('/properties/landlord/my-properties', { params });
    return response.data;
  },

  // Toggle availability
  toggleAvailability: async (id) => {
    const response = await api.patch(`/properties/${id}/availability`);
    return response.data;
  },

  // Save property
  saveProperty: async (id) => {
    const response = await api.post(`/properties/${id}/save`);
    return response.data;
  },

  // Unsave property
  unsaveProperty: async (id) => {
    const response = await api.delete(`/properties/${id}/save`);
    return response.data;
  },

  // Get saved properties
  getSavedProperties: async (params) => {
    const response = await api.get('/properties/user/saved', { params });
    return response.data;
  },

  // Add review
  addReview: async (propertyId, reviewData) => {
    const response = await api.post(`/properties/${propertyId}/review`, reviewData);
    return response.data;
  },

  // Get property reviews
  getPropertyReviews: async (propertyId, params) => {
    const response = await api.get(`/properties/${propertyId}/reviews`, { params });
    return response.data;
  },

  // Get property stats
  getPropertyStats: async (propertyId) => {
    const response = await api.get(`/properties/${propertyId}/stats`);
    return response.data;
  },

  // Get popular locations
  getPopularLocations: async (limit = 10) => {
    const response = await api.get('/property-utils/popular-locations', { params: { limit } });
    return response.data;
  },

  // Get similar properties
  getSimilarProperties: async (propertyId, limit = 5) => {
    const response = await api.get(`/property-utils/similar/${propertyId}`, { params: { limit } });
    return response.data;
  },

  // Get recommendations
  getRecommendations: async (limit = 10) => {
    const response = await api.get('/property-utils/recommendations', { params: { limit } });
    return response.data;
  },

  // Submit tenant request when desired property type is unavailable
  requestPropertyAlert: async (requestData) => {
    const response = await api.post('/property-alerts/request', requestData);
    return response.data;
  },
};
