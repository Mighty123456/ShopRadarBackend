# 🤖 ML Recommendation System Setup Guide

## 📋 **Overview**

This guide will help you set up the ML recommendation system for ShopRadar, including:
- User behavior analysis
- Collaborative filtering
- Content-based filtering
- Location-based recommendations
- Advanced analytics

## 🚀 **Installation Steps**

### **Step 1: Install Dependencies**

```bash
cd backend_node
npm install
```

The following ML packages will be installed:
- `ml-matrix` - Matrix operations for ML algorithms
- `natural` - Natural language processing
- `compromise` - Text analysis
- `sentiment` - Sentiment analysis
- `node-nlp` - Advanced NLP
- `ml-kmeans` - Clustering algorithms
- `ml-distance` - Distance calculations

### **Step 2: Database Setup**

The ML system uses 3 new MongoDB collections:
- `userbehaviors` - Tracks user interactions
- `recommendations` - Stores generated recommendations
- `userprofiles` - ML-enhanced user profiles

These will be created automatically when you first use the ML endpoints.

### **Step 3: Environment Variables**

Add these to your `.env` file:

```env
# ML Configuration
ML_CACHE_TIMEOUT=300000
ML_RECOMMENDATION_LIMIT=20
ML_SIMILAR_USERS_LIMIT=10
ML_ANALYTICS_CACHE_TTL=300
```

## 🔧 **API Endpoints**

### **User Behavior Tracking**

```javascript
// Track user behavior
POST /api/ml/track
{
  "behaviorType": "view_product",
  "targetId": "product_id",
  "targetType": "product",
  "metadata": {
    "productCategory": "Electronics",
    "productPrice": 299.99,
    "searchQuery": "smartphone"
  }
}
```

### **Get Recommendations**

```javascript
// Get personalized recommendations
GET /api/ml/recommendations?type=hybrid&limit=20&latitude=37.7749&longitude=-122.4194

// Response
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "targetId": "product_id",
        "targetType": "product",
        "score": 0.85,
        "confidence": 0.9,
        "metadata": {
          "distance": 2.5,
          "shopName": "TechMart"
        }
      }
    ],
    "total": 20,
    "type": "hybrid"
  }
}
```

### **User Analytics**

```javascript
// Get user behavior analytics
GET /api/ml/analytics?timeRange=30

// Response includes:
// - Behavior patterns
// - Engagement metrics
// - Preference analysis
// - Recommendation performance
// - Time-based insights
// - Category insights
// - Location insights
// - Predictive insights
```

### **Feedback System**

```javascript
// Provide feedback on recommendations
POST /api/ml/recommendations/feedback
{
  "recommendationId": "rec_id",
  "feedback": {
    "clicked": true,
    "liked": true,
    "dismissed": false
  }
}
```

## 🎯 **Integration Examples**

### **Frontend Integration (Flutter)**

```dart
// Track user behavior
await ApiService.post('/api/ml/track', {
  'behaviorType': 'view_product',
  'targetId': product.id,
  'targetType': 'product',
  'metadata': {
    'productCategory': product.category,
    'productPrice': product.price,
    'searchQuery': searchQuery
  }
});

// Get recommendations
final response = await ApiService.get('/api/ml/recommendations?type=hybrid&limit=20&latitude=$lat&longitude=$lng');
final recommendations = response.data['recommendations'];

// Provide feedback
await ApiService.post('/api/ml/recommendations/feedback', {
  'recommendationId': recommendationId,
  'feedback': {
    'clicked': true,
    'liked': true
  }
});
```

### **Admin Dashboard Integration**

```javascript
// Get system analytics
const analytics = await fetch('/api/ml/admin/analytics?timeRange=30');

// Get model performance
const performance = await fetch('/api/ml/admin/performance?timeRange=30');

// Retrain models
await fetch('/api/ml/admin/retrain', { method: 'POST' });
```

## 📊 **ML Features Explained**

### **1. User Behavior Analysis**
- Tracks all user interactions (views, clicks, searches, etc.)
- Analyzes patterns and preferences
- Builds comprehensive user profiles
- Provides insights for personalization

### **2. Collaborative Filtering**
- Finds users with similar behavior patterns
- Recommends items liked by similar users
- Uses cosine similarity for user matching
- Continuously learns from user interactions

### **3. Content-Based Filtering**
- Recommends items similar to user's preferences
- Analyzes product categories, prices, ratings
- Considers user's historical preferences
- Provides relevant content suggestions

### **4. Location-Based Recommendations**
- Finds nearby shops and offers
- Considers distance and location preferences
- Prioritizes local businesses
- Adapts to user's location patterns

### **5. Hybrid Recommendations**
- Combines all recommendation methods
- Uses weighted scoring system
- Provides most relevant suggestions
- Balances different recommendation types

## 🔍 **Analytics Dashboard**

The ML system provides comprehensive analytics:

### **User Analytics**
- Behavior patterns and trends
- Engagement metrics
- Preference analysis
- Recommendation performance
- Time-based insights
- Category preferences
- Location patterns
- Search patterns
- Predictive insights

### **System Analytics**
- Total behaviors and recommendations
- Active users count
- Top categories
- Recommendation performance metrics
- Model performance by type

### **Admin Analytics**
- Model performance comparison
- Click-through rates by algorithm
- User engagement trends
- System-wide insights

## 🚀 **Getting Started**

### **1. Test the System**

```bash
# Start the server
npm start

# Test ML endpoints
curl -X POST http://localhost:3000/api/ml/track \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "behaviorType": "view_product",
    "targetId": "test_product_id",
    "targetType": "product",
    "metadata": {
      "productCategory": "Electronics",
      "productPrice": 299.99
    }
  }'
```

### **2. Generate Recommendations**

```bash
# Get recommendations
curl -X GET "http://localhost:3000/api/ml/recommendations?type=hybrid&limit=10&latitude=37.7749&longitude=-122.4194" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### **3. View Analytics**

```bash
# Get user analytics
curl -X GET "http://localhost:3000/api/ml/analytics?timeRange=30" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📈 **Performance Optimization**

### **Caching**
- Analytics results are cached for 5 minutes
- User profiles are cached for better performance
- Recommendation results are cached for 1 hour

### **Database Indexes**
- Optimized indexes for fast queries
- Geospatial indexes for location-based searches
- Compound indexes for complex queries

### **Scaling**
- Horizontal scaling with MongoDB sharding
- Caching layer with Redis (optional)
- Load balancing for high traffic

## 🔧 **Configuration**

### **ML Parameters**
```javascript
// In mlRecommendationService.js
const ML_CONFIG = {
  COLLABORATIVE_WEIGHT: 0.3,
  CONTENT_WEIGHT: 0.4,
  LOCATION_WEIGHT: 0.3,
  MIN_SIMILARITY_THRESHOLD: 0.1,
  MAX_RECOMMENDATIONS: 20,
  CACHE_TIMEOUT: 300000
};
```

### **Behavior Scoring**
```javascript
// Different behavior types have different scores
const BEHAVIOR_SCORES = {
  'view_product': 1,
  'click_offer': 3,
  'add_to_favorites': 5,
  'purchase_product': 10
};
```

## 🐛 **Troubleshooting**

### **Common Issues**

1. **No recommendations generated**
   - Check if user has enough behavior data
   - Verify location coordinates are provided
   - Check database connections

2. **Low recommendation quality**
   - Ensure user profiles are being updated
   - Check if feedback is being recorded
   - Verify ML models are working correctly

3. **Performance issues**
   - Check database indexes
   - Monitor memory usage
   - Consider caching strategies

### **Debug Mode**

Enable debug logging:
```javascript
// In mlRecommendationService.js
const DEBUG = process.env.NODE_ENV === 'development';
```

## 📚 **Next Steps**

1. **Install the dependencies**
2. **Test the basic endpoints**
3. **Integrate with your frontend**
4. **Monitor performance**
5. **Customize algorithms as needed**

## 🆘 **Support**

For issues or questions:
1. Check the logs for error messages
2. Verify database connections
3. Test with sample data
4. Review the API documentation

The ML system is now ready to provide intelligent recommendations for your ShopRadar application! 🎉
