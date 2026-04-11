// ====================== IMPORTS ======================
const db = require('../config/middleware/database');

// ====================== LOCATION FILTERING SERVICE ======================

/**
 * Get properties filtered by state admin's assigned location
 * This service ensures state admins only see properties in their assigned state/city
 */
exports.filterPropertiesByAdminLocation = async (adminId, queryParams = {}) => {
  try {
    // Get admin's assigned location
    const adminResult = await db.query(
      `SELECT assigned_state, assigned_city 
       FROM users 
       WHERE id = $1 AND user_type IN ('state_admin', 'state_financial_admin')`,
      [adminId]
    );
    
    if (adminResult.rows.length === 0) {
      throw new Error('State admin not found');
    }
    
    const admin = adminResult.rows[0];
    const { assigned_state, assigned_city } = admin;
    
    if (!assigned_state) {
      throw new Error('Admin has no assigned state');
    }
    
    // Build query with location filter
    const {
      page = 1,
      limit = 20,
      property_type,
      min_price,
      max_price,
      bedrooms,
      bathrooms,
      amenities,
      search,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = queryParams;
    
    const offset = (page - 1) * limit;
    const params = [];
    let paramCount = 1;
    
    // Start with location filter
    let whereConditions = [
      'p.is_available = TRUE',
      'p.is_verified = TRUE',
      '(p.expires_at IS NULL OR p.expires_at > CURRENT_TIMESTAMP)'
    ];
    
    // Add state filter
    whereConditions.push(`LOWER(p.state) = LOWER($${paramCount})`);
    params.push(assigned_state);
    paramCount++;
    
    // Add city filter if admin has assigned city
    if (assigned_city) {
      whereConditions.push(`LOWER(p.city) = LOWER($${paramCount})`);
      params.push(assigned_city);
      paramCount++;
    }
    
    // Add other filters
    if (search) {
      whereConditions.push(`(
        LOWER(p.title) LIKE LOWER($${paramCount}) OR
        LOWER(COALESCE(p.description, '')) LIKE LOWER($${paramCount}) OR
        LOWER(COALESCE(p.city, '')) LIKE LOWER($${paramCount}) OR
        LOWER(COALESCE(p.area, '')) LIKE LOWER($${paramCount})
      )`);
      params.push(`%${search}%`);
      paramCount++;
    }
    
    if (property_type) {
      whereConditions.push(`p.property_type = $${paramCount}`);
      params.push(property_type);
      paramCount++;
    }
    
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
    
    if (bedrooms) {
      whereConditions.push(`p.bedrooms >= $${paramCount}`);
      params.push(bedrooms);
      paramCount++;
    }
    
    if (bathrooms) {
      whereConditions.push(`p.bathrooms >= $${paramCount}`);
      params.push(bathrooms);
      paramCount++;
    }
    
    if (amenities) {
      const arr = Array.isArray(amenities) ? amenities : [amenities];
      whereConditions.push(`p.amenities @> $${paramCount}::jsonb`);
      params.push(JSON.stringify(arr));
      paramCount++;
    }
    
    // Validate sort fields
    const validSortFields = ['created_at', 'rent_amount', 'bedrooms', 'bathrooms'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
    const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    // Build query
    const query = `
      SELECT 
        p.id, p.title, p.property_type, p.bedrooms, p.bathrooms,
        p.rent_amount, p.payment_frequency, p.city, p.area, p.state,
        p.amenities, p.featured, p.created_at,
        u.full_name as landlord_name, u.email as landlord_email,
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
    
    // Execute query
    const result = await db.query(query, params);
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*)
      FROM properties p
      WHERE ${whereConditions.join(' AND ')}
    `;
    
    const countResult = await db.query(countQuery, params.slice(0, -2));
    
    return {
      properties: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
      total_pages: Math.ceil(countResult.rows[0].count / limit),
      location_filter: {
        state: assigned_state,
        city: assigned_city
      }
    };
    
  } catch (error) {
    console.error('Filter properties by admin location error:', error);
    throw error;
  }
};

/**
 * Get transactions filtered by state admin's assigned location
 */
exports.filterTransactionsByAdminLocation = async (adminId, queryParams = {}) => {
  try {
    // Get admin's assigned location
    const adminResult = await db.query(
      `SELECT assigned_state, assigned_city 
       FROM users 
       WHERE id = $1 AND user_type IN ('state_admin', 'state_financial_admin')`,
      [adminId]
    );
    
    if (adminResult.rows.length === 0) {
      throw new Error('State admin not found');
    }
    
    const admin = adminResult.rows[0];
    const { assigned_state, assigned_city } = admin;
    
    if (!assigned_state) {
      throw new Error('Admin has no assigned state');
    }
    
    // Build query
    const {
      page = 1,
      limit = 50,
      payment_type,
      start_date,
      end_date,
      payment_status
    } = queryParams;
    
    const offset = (page - 1) * limit;
    const params = [];
    let paramCount = 1;
    
    // Start with location filter
    let whereConditions = ['p.payment_status = \'completed\''];
    
    // Add state filter
    whereConditions.push(`prop.state = $${paramCount}`);
    params.push(assigned_state);
    paramCount++;
    
    // Add city filter if admin has assigned city
    if (assigned_city) {
      whereConditions.push(`prop.city = $${paramCount}`);
      params.push(assigned_city);
      paramCount++;
    }
    
    // Add other filters
    if (payment_type) {
      whereConditions.push(`p.payment_type = $${paramCount}`);
      params.push(payment_type);
      paramCount++;
    }
    
    if (payment_status) {
      whereConditions.push(`p.payment_status = $${paramCount}`);
      params.push(payment_status);
      paramCount++;
    }
    
    if (start_date) {
      whereConditions.push(`p.created_at >= $${paramCount}`);
      params.push(start_date);
      paramCount++;
    }
    
    if (end_date) {
      whereConditions.push(`p.created_at <= $${paramCount}`);
      params.push(end_date);
      paramCount++;
    }
    
    // Build query
    const query = `
      SELECT 
        p.*,
        u.full_name as user_name,
        u.email as user_email,
        u.phone as user_phone,
        prop.title as property_title,
        prop.state as property_state,
        prop.city as property_city,
        prop.area as property_area,
        ac.amount as commission_amount,
        ac.source as commission_source,
        ac.status as commission_status
      FROM payments p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN properties prop ON p.property_id = prop.id
      LEFT JOIN admin_commissions ac ON p.id = ac.payment_id AND ac.admin_id = $${paramCount}
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY p.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    
    params.push(adminId, limit, offset);
    
    // Execute query
    const result = await db.query(query, params);
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*)
      FROM payments p
      LEFT JOIN properties prop ON p.property_id = prop.id
      WHERE ${whereConditions.join(' AND ')}
    `;
    
    const countResult = await db.query(countQuery, params.slice(0, -3));
    
    // Get summary statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_transactions,
        SUM(p.amount) as total_amount,
        p.payment_type,
        COUNT(CASE WHEN p.payment_status = 'completed' THEN 1 END) as completed_count
      FROM payments p
      LEFT JOIN properties prop ON p.property_id = prop.id
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY p.payment_type
    `;
    
    const statsResult = await db.query(statsQuery, params.slice(0, -3));
    
    return {
      transactions: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
      total_pages: Math.ceil(countResult.rows[0].count / limit),
      statistics: statsResult.rows,
      location_filter: {
        state: assigned_state,
        city: assigned_city
      }
    };
    
  } catch (error) {
    console.error('Filter transactions by admin location error:', error);
    throw error;
  }
};

/**
 * Get users managed by state admin (users referred by this admin)
 */
exports.getManagedUsers = async (adminId, queryParams = {}) => {
  try {
    const {
      page = 1,
      limit = 50,
      user_type,
      start_date,
      end_date
    } = queryParams;
    
    const offset = (page - 1) * limit;
    const params = [adminId];
    let paramCount = 2;
    
    let whereConditions = ['u.referred_by = $1'];
    
    if (user_type) {
      whereConditions.push(`u.user_type = $${paramCount}`);
      params.push(user_type);
      paramCount++;
    }
    
    if (start_date) {
      whereConditions.push(`u.created_at >= $${paramCount}`);
      params.push(start_date);
      paramCount++;
    }
    
    if (end_date) {
      whereConditions.push(`u.created_at <= $${paramCount}`);
      params.push(end_date);
      paramCount++;
    }
    
    // Build query
    const query = `
      SELECT 
        u.*,
        (SELECT COUNT(*) FROM payments WHERE user_id = u.id AND payment_status = 'completed') as total_transactions,
        (SELECT SUM(amount) FROM payments WHERE user_id = u.id AND payment_status = 'completed') as total_spent,
        (SELECT COUNT(*) FROM properties WHERE landlord_id = u.id) as properties_listed,
        (SELECT COUNT(*) FROM applications WHERE tenant_id = u.id) as applications_made
      FROM users u
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY u.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    
    params.push(limit, offset);
    
    // Execute query
    const result = await db.query(query, params);
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*)
      FROM users u
      WHERE ${whereConditions.join(' AND ')}
    `;
    
    const countResult = await db.query(countQuery, params.slice(0, -2));
    
    // Get user type breakdown
    const breakdownQuery = `
      SELECT 
        user_type,
        COUNT(*) as count
      FROM users u
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY user_type
    `;
    
    const breakdownResult = await db.query(breakdownQuery, params.slice(0, -2));
    
    return {
      users: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
      total_pages: Math.ceil(countResult.rows[0].count / limit),
      user_breakdown: breakdownResult.rows
    };
    
  } catch (error) {
    console.error('Get managed users error:', error);
    throw error;
  }
};

/**
 * Get location statistics for state admin
 */
exports.getLocationStatistics = async (adminId) => {
  try {
    // Get admin's assigned location
    const adminResult = await db.query(
      `SELECT assigned_state, assigned_city 
       FROM users 
       WHERE id = $1 AND user_type IN ('state_admin', 'state_financial_admin')`,
      [adminId]
    );
    
    if (adminResult.rows.length === 0) {
      throw new Error('State admin not found');
    }
    
    const admin = adminResult.rows[0];
    const { assigned_state, assigned_city } = admin;
    
    // Get property statistics
    const propertyStatsQuery = `
      SELECT 
        COUNT(*) as total_properties,
        SUM(CASE WHEN is_available = TRUE THEN 1 ELSE 0 END) as available_properties,
        SUM(CASE WHEN featured = TRUE THEN 1 ELSE 0 END) as featured_properties,
        AVG(rent_amount) as avg_rent,
        property_type,
        COUNT(*) as type_count
      FROM properties
      WHERE state = $1
        ${assigned_city ? 'AND city = $2' : ''}
        AND is_verified = TRUE
      GROUP BY property_type
    `;
    
    const propertyParams = assigned_city ? [assigned_state, assigned_city] : [assigned_state];
    const propertyStats = await db.query(propertyStatsQuery, propertyParams);
    
    // Get transaction statistics
    const transactionStatsQuery = `
      SELECT 
        COUNT(*) as total_transactions,
        SUM(p.amount) as total_volume,
        p.payment_type,
        COUNT(*) as type_count
      FROM payments p
      LEFT JOIN properties prop ON p.property_id = prop.id
      WHERE prop.state = $1
        ${assigned_city ? 'AND prop.city = $2' : ''}
        AND p.payment_status = 'completed'
      GROUP BY p.payment_type
    `;
    
    const transactionStats = await db.query(transactionStatsQuery, propertyParams);
    
    // Get user statistics
    const userStatsQuery = `
      SELECT 
        COUNT(*) as total_users,
        user_type,
        COUNT(*) as type_count
      FROM users
      WHERE referred_by = $1
      GROUP BY user_type
    `;
    
    const userStats = await db.query(userStatsQuery, [adminId]);
    
    // Get commission statistics
    const commissionStatsQuery = `
      SELECT 
        COUNT(*) as total_commissions,
        SUM(amount) as total_earnings,
        source,
        COUNT(*) as source_count,
        status,
        COUNT(*) as status_count
      FROM admin_commissions
      WHERE admin_id = $1
      GROUP BY source, status
    `;
    
    const commissionStats = await db.query(commissionStatsQuery, [adminId]);
    
    return {
      location: {
        state: assigned_state,
        city: assigned_city
      },
      property_statistics: propertyStats.rows,
      transaction_statistics: transactionStats.rows,
      user_statistics: userStats.rows,
      commission_statistics: commissionStats.rows
    };
    
  } catch (error) {
    console.error('Get location statistics error:', error);
    throw error;
  }
};