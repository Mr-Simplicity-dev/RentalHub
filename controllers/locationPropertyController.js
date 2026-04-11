// ====================== IMPORTS ======================
const db = require('../config/middleware/database');

// ====================== LOCATION-BASED PROPERTY FILTERING ======================

/**
 * Get properties by state (for state admin dashboard)
 * Filters properties based on state admin's assigned state/city
 */
exports.getPropertiesByState = async (req, res) => {
  try {
    const {
      state,
      city,
      property_type,
      min_price,
      max_price,
      bedrooms,
      bathrooms,
      page = 1,
      limit = 20,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query;
    
    const offset = (page - 1) * limit;
    const params = [];
    let paramCount = 1;
    
    const whereConditions = [
      'p.is_available = TRUE',
      'p.is_verified = TRUE',
      '(p.expires_at IS NULL OR p.expires_at > CURRENT_TIMESTAMP)'
    ];
    
    // State filter (required for state admin)
    if (state) {
      whereConditions.push(`p.state = $${paramCount}`);
      params.push(state);
      paramCount++;
    }
    
    // City filter (optional)
    if (city) {
      whereConditions.push(`p.city = $${paramCount}`);
      params.push(city);
      paramCount++;
    }
    
    // Property Type filter
    if (property_type) {
      whereConditions.push(`p.property_type = $${paramCount}`);
      params.push(property_type);
      paramCount++;
    }
    
    // Price Filters
    if (min_price) {
      whereConditions.push(`p.rent_amount >= $${paramCount}`);
      params.push(min_price);
      paramCount++;
    }
    
    if (max_price) {
      whereConditions.push(`p.rent_amount <= $${paramCount}`);
      params.push(max_price);
      paramCount++;
    }
    
    // Bedrooms
    if (bedrooms) {
      whereConditions.push(`p.bedrooms >= $${paramCount}`);
      params.push(bedrooms);
      paramCount++;
    }
    
    // Bathrooms
    if (bathrooms) {
      whereConditions.push(`p.bathrooms >= $${paramCount}`);
      params.push(bathrooms);
      paramCount++;
    }
    
    const validSortFields = ['created_at', 'rent_amount', 'bedrooms'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
    const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    const query = `
      SELECT 
        p.id, p.title, p.property_type, p.bedrooms, p.bathrooms,
        p.rent_amount, p.payment_frequency, p.city, p.area,
        p.state, p.featured, p.created_at,
        u.full_name as landlord_name,
        u.email as landlord_email,
        u.phone as landlord_phone,
        (SELECT photo_url FROM property_photos 
         WHERE property_id = p.id AND is_primary = TRUE LIMIT 1) AS primary_photo,
        (SELECT COUNT(*) FROM property_photos WHERE property_id = p.id) AS photo_count,
        (SELECT AVG(rating) FROM reviews WHERE property_id = p.id) AS avg_rating,
        (SELECT COUNT(*) FROM reviews WHERE property_id = p.id) AS review_count,
        (SELECT COUNT(*) FROM applications WHERE property_id = p.id) AS application_count
      FROM properties p
      JOIN users u ON p.landlord_id = u.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY p.featured DESC, p.${sortField} ${sortDirection}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    
    params.push(limit, offset);
    
    const result = await db.query(query, params);
    
    // Total count
    const countQuery = `
      SELECT COUNT(*)
      FROM properties p
      WHERE ${whereConditions.join(' AND ')}
    `;
    const countResult = await db.query(countQuery, params.slice(0, -2));
    
    // Get statistics for the state/city
    const statsQuery = `
      SELECT 
        COUNT(*) as total_properties,
        SUM(CASE WHEN p.featured = TRUE THEN 1 ELSE 0 END) as featured_properties,
        AVG(p.rent_amount) as avg_rent,
        MIN(p.rent_amount) as min_rent,
        MAX(p.rent_amount) as max_rent,
        COUNT(DISTINCT p.landlord_id) as unique_landlords,
        COUNT(DISTINCT p.city) as unique_cities
      FROM properties p
      WHERE ${whereConditions.slice(0, -2).join(' AND ')}
    `;
    
    const statsResult = await db.query(statsQuery, params.slice(0, -2));
    
    res.json({
      success: true,
      data: result.rows,
      statistics: statsResult.rows[0],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count)
      }
    });
    
  } catch (error) {
    console.error('Get properties by state error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch properties'
    });
  }
};

/**
 * Get state statistics for financial admin dashboard
 */
exports.getStateStatistics = async (req, res) => {
  try {
    const { state, start_date, end_date } = req.query;
    
    let query = `
      SELECT 
        p.state,
        COUNT(p.id) as total_properties,
        SUM(CASE WHEN p.is_available = TRUE THEN 1 ELSE 0 END) as available_properties,
        SUM(CASE WHEN p.featured = TRUE THEN 1 ELSE 0 END) as featured_properties,
        COUNT(DISTINCT p.landlord_id) as unique_landlords,
        AVG(p.rent_amount) as avg_rent,
        SUM(p.rent_amount) as total_rent_value,
        COUNT(DISTINCT p.city) as unique_cities
      FROM properties p
      WHERE p.is_verified = TRUE
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (state) {
      query += ` AND p.state = $${paramCount}`;
      params.push(state);
      paramCount++;
    }
    
    if (start_date) {
      query += ` AND p.created_at >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }
    
    if (end_date) {
      query += ` AND p.created_at <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }
    
    query += ` GROUP BY p.state ORDER BY total_properties DESC`;
    
    const result = await db.query(query, params);
    
    // Get transaction statistics by state
    const transactionQuery = `
      SELECT 
        prop.state,
        COUNT(p.id) as total_transactions,
        SUM(p.amount) as total_amount,
        COUNT(DISTINCT p.user_id) as unique_users,
        COUNT(DISTINCT p.property_id) as unique_properties,
        p.payment_type
      FROM payments p
      LEFT JOIN properties prop ON p.property_id = prop.id
      WHERE p.payment_status = 'completed'
    `;
    
    const transactionParams = [];
    let transactionParamCount = 1;
    
    if (state) {
      transactionQuery += ` AND prop.state = $${transactionParamCount}`;
      transactionParams.push(state);
      transactionParamCount++;
    }
    
    if (start_date) {
      transactionQuery += ` AND p.created_at >= $${transactionParamCount}`;
      transactionParams.push(start_date);
      transactionParamCount++;
    }
    
    if (end_date) {
      transactionQuery += ` AND p.created_at <= $${transactionParamCount}`;
      transactionParams.push(end_date);
      transactionParamCount++;
    }
    
    transactionQuery += ` GROUP BY prop.state, p.payment_type ORDER BY total_amount DESC`;
    
    const transactionResult = await db.query(transactionQuery, transactionParams);
    
    // Get commission statistics by state
    const commissionQuery = `
      SELECT 
        u.assigned_state as state,
        COUNT(ac.id) as total_commissions,
        SUM(ac.amount) as total_commission_amount,
        AVG(ac.commission_rate) as avg_commission_rate,
        COUNT(DISTINCT ac.admin_id) as unique_admins,
        ac.source
      FROM admin_commissions ac
      JOIN users u ON ac.admin_id = u.id
      WHERE ac.status = 'pending'
    `;
    
    const commissionParams = [];
    let commissionParamCount = 1;
    
    if (state) {
      commissionQuery += ` AND u.assigned_state = $${commissionParamCount}`;
      commissionParams.push(state);
      commissionParamCount++;
    }
    
    if (start_date) {
      commissionQuery += ` AND ac.created_at >= $${commissionParamCount}`;
      commissionParams.push(start_date);
      commissionParamCount++;
    }
    
    if (end_date) {
      commissionQuery += ` AND ac.created_at <= $${commissionParamCount}`;
      commissionParams.push(end_date);
      commissionParamCount++;
    }
    
    commissionQuery += ` GROUP BY u.assigned_state, ac.source ORDER BY total_commission_amount DESC`;
    
    const commissionResult = await db.query(commissionQuery, commissionParams);
    
    res.json({
      success: true,
      data: {
        property_statistics: result.rows,
        transaction_statistics: transactionResult.rows,
        commission_statistics: commissionResult.rows
      }
    });
    
  } catch (error) {
    console.error('Get state statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch state statistics'
    });
  }
};

/**
 * Get cities within a state
 */
exports.getCitiesByState = async (req, res) => {
  try {
    const { state } = req.query;
    
    if (!state) {
      return res.status(400).json({
        success: false,
        message: 'State parameter is required'
      });
    }
    
    const query = `
      SELECT 
        city,
        COUNT(*) as property_count,
        AVG(rent_amount) as avg_rent,
        MIN(rent_amount) as min_rent,
        MAX(rent_amount) as max_rent,
        COUNT(DISTINCT landlord_id) as unique_landlords
      FROM properties
      WHERE state = $1
        AND is_verified = TRUE
        AND is_available = TRUE
      GROUP BY city
      ORDER BY property_count DESC
    `;
    
    const result = await db.query(query, [state]);
    
    res.json({
      success: true,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Get cities by state error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cities'
    });
  }
};

/**
 * Get property types distribution by state
 */
exports.getPropertyTypesByState = async (req, res) => {
  try {
    const { state, city } = req.query;
    
    let query = `
      SELECT 
        property_type,
        COUNT(*) as count,
        AVG(rent_amount) as avg_rent,
        AVG(bedrooms) as avg_bedrooms,
        AVG(bathrooms) as avg_bathrooms
      FROM properties
      WHERE is_verified = TRUE
        AND is_available = TRUE
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (state) {
      query += ` AND state = $${paramCount}`;
      params.push(state);
      paramCount++;
    }
    
    if (city) {
      query += ` AND city = $${paramCount}`;
      params.push(city);
      paramCount++;
    }
    
    query += ` GROUP BY property_type ORDER BY count DESC`;
    
    const result = await db.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Get property types by state error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch property types distribution'
    });
  }
};

/**
 * Get rental price distribution by state
 */
exports.getRentalPriceDistribution = async (req, res) => {
  try {
    const { state, city } = req.query;
    
    let query = `
      SELECT 
        CASE
          WHEN rent_amount < 50000 THEN 'Under ₦50,000'
          WHEN rent_amount >= 50000 AND rent_amount < 100000 THEN '₦50,000 - ₦99,999'
          WHEN rent_amount >= 100000 AND rent_amount < 200000 THEN '₦100,000 - ₦199,999'
          WHEN rent_amount >= 200000 AND rent_amount < 500000 THEN '₦200,000 - ₦499,999'
          WHEN rent_amount >= 500000 AND rent_amount < 1000000 THEN '₦500,000 - ₦999,999'
          ELSE '₦1,000,000+'
        END as price_range,
        COUNT(*) as property_count,
        AVG(bedrooms) as avg_bedrooms,
        AVG(bathrooms) as avg_bathrooms
      FROM properties
      WHERE is_verified = TRUE
        AND is_available = TRUE
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (state) {
      query += ` AND state = $${paramCount}`;
      params.push(state);
      paramCount++;
    }
    
    if (city) {
      query += ` AND city = $${paramCount}`;
      params.push(city);
      paramCount++;
    }
    
    query += ` GROUP BY price_range ORDER BY MIN(rent_amount)`;
    
    const result = await db.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Get rental price distribution error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rental price distribution'
    });
  }
};

/**
 * Get state admin performance by location
 */
exports.getStateAdminPerformance = async (req, res) => {
  try {
    const { state, city, start_date, end_date } = req.query;
    
    let query = `
      SELECT 
        u.id as admin_id,
        u.full_name as admin_name,
        u.email as admin_email,
        u.assigned_state,
        u.assigned_city,
        u.admin_wallet_balance,
        COUNT(DISTINCT ac.id) as total_commissions,
        SUM(CASE WHEN ac.status = 'pending' THEN ac.amount ELSE 0 END) as pending_commissions,
        SUM(CASE WHEN ac.status = 'paid' THEN ac.amount ELSE 0 END) as paid_commissions,
        COUNT(DISTINCT u2.id) as managed_users,
        COUNT(DISTINCT aw.id) as withdrawal_requests,
        SUM(CASE WHEN aw.status = 'processed' THEN aw.amount ELSE 0 END) as total_withdrawn
      FROM users u
      LEFT JOIN admin_commissions ac ON u.id = ac.admin_id
      LEFT JOIN users u2 ON u2.referred_by = u.id
      LEFT JOIN admin_withdrawals aw ON u.id = aw.admin_id
      WHERE u.user_type IN ('state_admin', 'state_financial_admin')
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (state) {
      query += ` AND u.assigned_state = $${paramCount}`;
      params.push(state);
      paramCount++;
    }
    
    if (city) {
      query += ` AND u.assigned_city = $${paramCount}`;
      params.push(city);
      paramCount++;
    }
    
    if (start_date) {
      query += ` AND ac.created_at >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }
    
    if (end_date) {
      query += ` AND ac.created_at <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }
    
    query += ` GROUP BY u.id, u.full_name, u.email, u.assigned_state, u.assigned_city, u.admin_wallet_balance
               ORDER BY pending_commissions DESC`;
    
    const result = await db.query(query, params);
    
    // Get commission breakdown by source
    let sourceQuery = `
      SELECT 
        u.assigned_state,
        ac.source,
        COUNT(ac.id) as transaction_count,
        SUM(ac.amount) as total_amount,
        AVG(ac.commission_rate) as avg_rate
      FROM admin_commissions ac
      JOIN users u ON ac.admin_id = u.id
      WHERE u.user_type IN ('state_admin', 'state_financial_admin')
        AND ac.status = 'pending'
    `;
    
    const sourceParams = [];
    let sourceParamCount = 1;
    
    if (state) {
      sourceQuery += ` AND u.assigned_state = $${sourceParamCount}`;
      sourceParams.push(state);
      sourceParamCount++;
    }
    
    if (start_date) {
      sourceQuery += ` AND ac.created_at >= $${sourceParamCount}`;
      sourceParams.push(start_date);
      sourceParamCount++;
    }
    
    if (end_date) {
      sourceQuery += ` AND ac.created_at <= $${sourceParamCount}`;
      sourceParams.push(end_date);
      sourceParamCount++;
    }
    
    sourceQuery += ` GROUP BY u.assigned_state, ac.source ORDER BY total_amount DESC`;
    
    const sourceResult = await db.query(sourceQuery, sourceParams);
    
    res.json({
      success: true,
      data: {
        admin_performance: result.rows,
        commission_breakdown: sourceResult.rows
      }
    });
    
  } catch (error) {
    console.error('Get state admin performance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch state admin performance'
    });
  }
};
