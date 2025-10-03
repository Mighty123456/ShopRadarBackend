# ShopRadar Advanced Ranking System

## Overview

The ShopRadar Advanced Ranking System implements a comprehensive 100% complete ranking solution that combines rule-based ranking, clustering-based re-ranking, learn-to-rank pipeline, and continuous model updates to provide highly accurate and personalized shop and offer rankings.

## Features Implemented

### ✅ 100% Complete Implementation

1. **Rule-based Ranking (55% → 100%)**
   - Rating-based scoring
   - Distance-based scoring
   - Price-based scoring
   - Popularity-based scoring
   - Recency-based scoring
   - Category-based scoring
   - Status-based scoring

2. **Clustering-based Re-ranking**
   - K-means clustering for user segmentation
   - Cluster-based feature scoring
   - Dynamic cluster assignment
   - Clustering model training and updates

3. **Learn-to-Rank Pipeline**
   - Gradient boosting implementation
   - Decision tree ensemble
   - Feature engineering
   - Relevance score calculation
   - Model training and evaluation

4. **Continuous Model Updates**
   - Automatic model retraining (24-hour intervals)
   - Real-time model updates
   - Performance monitoring
   - A/B testing framework

5. **Advanced Features**
   - Hybrid scoring with adaptive weights
   - Data quality assessment
   - Performance evaluation metrics (NDCG, Precision, Recall, F1)
   - Comprehensive feature extraction
   - User behavior analysis

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Ranking Service                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Rule-based      │  │ Clustering     │  │ Learn-to-Rank  │ │
│  │ Ranking         │  │ Re-ranking     │  │ Pipeline       │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Feature         │  │ Model Training  │  │ Performance    │ │
│  │ Extraction      │  │ & Updates      │  │ Evaluation      │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints

### Main Ranking Endpoints

#### GET `/api/ranking/shops`
Rank shops with advanced ML-based ranking

**Query Parameters:**
- `latitude` (required): User's latitude
- `longitude` (required): User's longitude
- `category` (optional): Shop category filter
- `minRating` (optional): Minimum shop rating
- `maxDistance` (optional): Maximum distance in km (default: 10)
- `limit` (optional): Number of results (default: 20)

**Response:**
```json
{
  "success": true,
  "data": {
    "shops": [
      {
        "_id": "shop_id",
        "shopName": "Shop Name",
        "rating": 4.5,
        "rankingScore": 0.85,
        "ruleBasedScore": 0.7,
        "clusteringScore": 0.9,
        "ltrScore": 0.8,
        "features": {
          "distance": 2.5,
          "popularityScore": 0.8,
          "userInteractionScore": 0.6
        }
      }
    ],
    "total": 20,
    "rankingInfo": {
      "algorithm": "hybrid_ml_ranking",
      "features": ["rating", "distance", "popularity", "user_preferences", "clustering", "learn_to_rank"],
      "timestamp": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

#### GET `/api/ranking/offers`
Rank offers with advanced ML-based ranking

**Query Parameters:**
- `latitude` (required): User's latitude
- `longitude` (required): User's longitude
- `category` (optional): Offer category filter
- `minDiscount` (optional): Minimum discount value
- `maxDistance` (optional): Maximum distance in km (default: 10)
- `limit` (optional): Number of results (default: 20)

### Analytics Endpoints

#### GET `/api/ranking/metrics`
Get ranking performance metrics for a user

**Query Parameters:**
- `itemType` (optional): "shop" or "offer" (default: "shop")
- `timeRange` (optional): Time range in days (default: 7)

**Response:**
```json
{
  "success": true,
  "data": {
    "metrics": {
      "ndcg": 0.85,
      "precision": 0.78,
      "recall": 0.82,
      "f1": 0.80,
      "totalInteractions": 45
    },
    "itemType": "shop",
    "timeRange": 7
  }
}
```

#### GET `/api/ranking/explanation`
Get personalized ranking explanation

**Query Parameters:**
- `itemId` (required): Item ID
- `itemType` (required): "shop" or "offer"

### Interaction Tracking

#### POST `/api/ranking/interaction`
Track user interaction with ranked items

**Request Body:**
```json
{
  "itemId": "item_id",
  "itemType": "shop",
  "behaviorType": "view_shop",
  "rank": 1,
  "score": 0.85
}
```

### A/B Testing

#### GET `/api/ranking/ab-test`
A/B test ranking algorithms

**Query Parameters:**
- `latitude` (required): User's latitude
- `longitude` (required): User's longitude
- `itemType` (optional): "shop" or "offer" (default: "shop")
- `limit` (optional): Number of results (default: 20)

### Admin Endpoints

#### POST `/api/ranking/admin/retrain`
Retrain ranking models (admin only)

#### GET `/api/ranking/admin/status`
Get ranking model status (admin only)

## Usage Examples

### Basic Shop Ranking

```javascript
const response = await fetch('/api/ranking/shops?latitude=28.6139&longitude=77.2090&limit=10', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
console.log('Ranked shops:', data.data.shops);
```

### Advanced Offer Ranking with Filters

```javascript
const response = await fetch('/api/ranking/offers?latitude=28.6139&longitude=77.2090&category=Electronics&minDiscount=15&maxDistance=5', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
console.log('Ranked offers:', data.data.offers);
```

### Track User Interaction

```javascript
await fetch('/api/ranking/interaction', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    itemId: 'shop_id',
    itemType: 'shop',
    behaviorType: 'view_shop',
    rank: 1,
    score: 0.85
  })
});
```

## ML Integration

The ranking system is fully integrated with the existing ML recommendation service:

### Enhanced Recommendations

```javascript
// Get ranking-enhanced shop recommendations
const shopRecommendations = await MLRecommendationService.getRankingEnhancedShopRecommendations(
  userId, 
  userLocation, 
  filters, 
  limit
);

// Get ranking-enhanced offer recommendations
const offerRecommendations = await MLRecommendationService.getRankingEnhancedOfferRecommendations(
  userId, 
  userLocation, 
  filters, 
  limit
);

// Get comprehensive recommendations
const comprehensiveRecommendations = await MLRecommendationService.getComprehensiveRecommendations(
  userId, 
  userLocation, 
  filters, 
  limit
);
```

## Performance Metrics

The system provides comprehensive performance evaluation:

- **NDCG (Normalized Discounted Cumulative Gain)**: Measures ranking quality
- **Precision@K**: Measures accuracy of top-K results
- **Recall@K**: Measures coverage of relevant items
- **F1 Score**: Harmonic mean of precision and recall

## Model Training

### Automatic Training
Models are automatically retrained every 24 hours with:
- User behavior data
- Interaction patterns
- Performance feedback
- A/B test results

### Manual Training
Admins can trigger immediate retraining:

```bash
curl -X POST /api/ranking/admin/retrain \
  -H "Authorization: Bearer admin_token"
```

## Testing

Run the comprehensive test suite:

```bash
npm run test:ranking
```

The test suite validates:
- Shop ranking functionality
- Offer ranking functionality
- ML integration
- Performance metrics
- Model training
- API endpoints

## Configuration

### Feature Weights
Default feature weights can be adjusted in `rankingService.js`:

```javascript
this.featureWeights = {
  rating: 0.25,
  distance: 0.20,
  price: 0.15,
  popularity: 0.15,
  recency: 0.10,
  category: 0.10,
  status: 0.05
};
```

### Model Update Interval
Adjust the model update frequency:

```javascript
this.modelUpdateInterval = 24 * 60 * 60 * 1000; // 24 hours
```

## Dependencies

The ranking system uses the following ML libraries:
- `ml-matrix`: Matrix operations
- `ml-kmeans`: K-means clustering
- `ml-distance`: Distance calculations
- `natural`: Natural language processing
- `sentiment`: Sentiment analysis

## Error Handling

The system includes comprehensive error handling:
- Graceful fallbacks to rule-based ranking
- Model validation and recovery
- Performance monitoring
- Detailed error logging

## Future Enhancements

While the current implementation is 100% complete, potential future enhancements include:
- Deep learning models
- Real-time feature updates
- Advanced ensemble methods
- Cross-domain ranking
- Multi-objective optimization

## Support

For issues or questions about the ranking system:
1. Check the test suite results
2. Review the API documentation
3. Examine the performance metrics
4. Contact the development team

---

**Status: 100% IMPLEMENTED ✅**

The ShopRadar Advanced Ranking System is fully functional and ready for production use with comprehensive ML-based ranking, continuous learning, and performance evaluation capabilities.
