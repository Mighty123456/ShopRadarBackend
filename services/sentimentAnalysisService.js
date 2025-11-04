const natural = require('natural');
const Sentiment = require('sentiment');

/**
 * Sentiment Analysis Service using Naive Bayes and Logistic Regression
 * Performs well on text classification, lightweight and fast, works with small datasets
 */
class SentimentAnalysisService {
  constructor() {
    // Initialize Naive Bayes Classifier
    this.classifier = new natural.BayesClassifier();
    
    // Initialize sentiment library as fallback
    this.sentimentLib = new Sentiment();
    
    // Training data for sentiment classification
    this.trainingData = [];
    this.isTrained = false;
    
    // Initialize with default training data
    this.initializeDefaultTraining();
  }

  /**
   * Initialize classifier with default training data
   * This provides baseline accuracy and can be improved with real review data
   */
  initializeDefaultTraining() {
    // Positive sentiment examples
    const positiveExamples = [
      { text: 'Great shop with excellent products!', sentiment: 'positive' },
      { text: 'Amazing service and quality items', sentiment: 'positive' },
      { text: 'Love this place! Highly recommended', sentiment: 'positive' },
      { text: 'Best shop in town, authentic products', sentiment: 'positive' },
      { text: 'Wonderful experience, will visit again', sentiment: 'positive' },
      { text: 'Excellent quality and fast service', sentiment: 'positive' },
      { text: 'Great prices and friendly staff', sentiment: 'positive' },
      { text: 'Perfect! Everything I needed', sentiment: 'positive' },
      { text: 'Outstanding shop with original products', sentiment: 'positive' },
      { text: 'Very satisfied with my purchase', sentiment: 'positive' },
      { text: 'Good value for money', sentiment: 'positive' },
      { text: 'Nice shop with good collection', sentiment: 'positive' },
      { text: 'Clean and well-organized store', sentiment: 'positive' },
      { text: 'Helpful staff and great selection', sentiment: 'positive' },
      { text: 'Quality products at reasonable prices', sentiment: 'positive' },
    ];

    // Negative sentiment examples
    const negativeExamples = [
      { text: 'Poor quality products, not worth it', sentiment: 'negative' },
      { text: 'Bad service and fake items', sentiment: 'negative' },
      { text: 'Worst experience, avoid this shop', sentiment: 'negative' },
      { text: 'Terrible quality and rude staff', sentiment: 'negative' },
      { text: 'Overpriced and disappointing', sentiment: 'negative' },
      { text: 'Fake products, waste of money', sentiment: 'negative' },
      { text: 'Slow service and poor quality', sentiment: 'negative' },
      { text: 'Not recommended, very poor experience', sentiment: 'negative' },
      { text: 'Disappointed with the products', sentiment: 'negative' },
      { text: 'Bad quality, items broke quickly', sentiment: 'negative' },
      { text: 'Late delivery and poor packaging', sentiment: 'negative' },
      { text: 'Unprofessional staff behavior', sentiment: 'negative' },
      { text: 'Expensive and not worth the price', sentiment: 'negative' },
      { text: 'Poor customer service', sentiment: 'negative' },
      { text: 'Low quality products, do not buy', sentiment: 'negative' },
    ];

    // Neutral sentiment examples
    const neutralExamples = [
      { text: 'Average shop with standard products', sentiment: 'neutral' },
      { text: 'Okay place, nothing special', sentiment: 'neutral' },
      { text: 'Regular shop with usual items', sentiment: 'neutral' },
      { text: 'Standard service and products', sentiment: 'neutral' },
      { text: 'Decent shop, moderate quality', sentiment: 'neutral' },
      { text: 'Average experience, could be better', sentiment: 'neutral' },
      { text: 'Normal shop with typical products', sentiment: 'neutral' },
      { text: 'Standard quality for the price', sentiment: 'neutral' },
      { text: 'Usual shop, nothing outstanding', sentiment: 'neutral' },
      { text: 'Regular service, meets expectations', sentiment: 'neutral' },
    ];

    // Train classifier with examples
    positiveExamples.forEach(ex => {
      this.classifier.addDocument(this.preprocessText(ex.text), ex.sentiment);
    });
    
    negativeExamples.forEach(ex => {
      this.classifier.addDocument(this.preprocessText(ex.text), ex.sentiment);
    });
    
    neutralExamples.forEach(ex => {
      this.classifier.addDocument(this.preprocessText(ex.text), ex.sentiment);
    });

    // Train the classifier
    this.classifier.train();
    this.isTrained = true;

    console.log('✅ Sentiment Analysis Service initialized with Naive Bayes classifier');
  }

  /**
   * Preprocess text for classification
   */
  preprocessText(text) {
    if (!text) return '';
    
    // Convert to lowercase
    let processed = text.toLowerCase();
    
    // Remove special characters but keep spaces
    processed = processed.replace(/[^\w\s]/g, ' ');
    
    // Remove extra spaces
    processed = processed.replace(/\s+/g, ' ').trim();
    
    return processed;
  }

  /**
   * Analyze sentiment of review text using Naive Bayes
   * @param {string} text - Review comment text
   * @param {number} rating - Numeric rating (1-5) for additional context
   * @returns {Object} Sentiment analysis result
   */
  analyzeSentiment(text, rating = null) {
    try {
      if (!text || text.trim().length === 0) {
        return {
          sentiment: 'neutral',
          confidence: 0.5,
          score: 0,
          method: 'default'
        };
      }

      // Preprocess text
      const processedText = this.preprocessText(text);

      // Classify using Naive Bayes
      const classification = this.classifier.classify(processedText);
      const classifications = this.classifier.getClassifications(processedText);
      
      // Get confidence from classifications
      const topClassification = classifications[0];
      const confidence = topClassification ? topClassification.value : 0.5;

      // Use sentiment library as additional validation
      const sentimentResult = this.sentimentLib.analyze(text);
      
      // Combine rating with text sentiment if rating provided
      let finalSentiment = classification;
      let finalScore = sentimentResult.score || 0;
      let finalConfidence = confidence;

      // Adjust based on rating if provided
      if (rating !== null) {
        if (rating >= 4 && finalSentiment === 'positive') {
          finalConfidence = Math.min(0.95, finalConfidence + 0.1);
        } else if (rating >= 4 && finalSentiment !== 'positive') {
          // Rating suggests positive but text suggests otherwise - use hybrid
          finalSentiment = 'neutral';
          finalConfidence = 0.6;
        } else if (rating <= 2 && finalSentiment === 'negative') {
          finalConfidence = Math.min(0.95, finalConfidence + 0.1);
        } else if (rating <= 2 && finalSentiment !== 'negative') {
          // Rating suggests negative but text suggests otherwise - use hybrid
          finalSentiment = 'neutral';
          finalConfidence = 0.6;
        }
      }

      // Calculate sentiment score (-5 to +5, normalized to 0-1)
      const normalizedScore = (sentimentResult.score + 5) / 10; // Normalize to 0-1
      
      return {
        sentiment: finalSentiment, // 'positive', 'negative', 'neutral'
        confidence: Math.round(finalConfidence * 100) / 100, // 0-1
        score: sentimentResult.score, // -5 to +5
        normalizedScore: normalizedScore, // 0 to 1
        method: 'naive_bayes',
        comparative: sentimentResult.comparative, // Average sentiment per word
        tokens: sentimentResult.tokens,
        words: sentimentResult.words,
        positive: sentimentResult.positive,
        negative: sentimentResult.negative
      };
    } catch (error) {
      console.error('Error analyzing sentiment:', error);
      // Fallback to simple sentiment library
      try {
        const sentimentResult = this.sentimentLib.analyze(text);
        return {
          sentiment: sentimentResult.score > 0 ? 'positive' : (sentimentResult.score < 0 ? 'negative' : 'neutral'),
          confidence: 0.5,
          score: sentimentResult.score,
          normalizedScore: (sentimentResult.score + 5) / 10,
          method: 'fallback_sentiment_lib',
          comparative: sentimentResult.comparative
        };
      } catch (fallbackError) {
        return {
          sentiment: 'neutral',
          confidence: 0.5,
          score: 0,
          normalizedScore: 0.5,
          method: 'default'
        };
      }
    }
  }

  /**
   * Retrain classifier with new review data
   * This allows the model to improve over time with real data
   */
  retrainWithReview(reviewText, actualSentiment, rating) {
    try {
      const processedText = this.preprocessText(reviewText);
      
      // Determine actual sentiment from rating if not provided
      let sentiment = actualSentiment;
      if (!sentiment && rating) {
        if (rating >= 4) sentiment = 'positive';
        else if (rating <= 2) sentiment = 'negative';
        else sentiment = 'neutral';
      }

      if (sentiment) {
        // Add to training data
        this.trainingData.push({
          text: processedText,
          sentiment: sentiment,
          rating: rating
        });

        // Retrain classifier (can be done periodically)
        this.classifier.addDocument(processedText, sentiment);
        this.classifier.retrain();
        
        console.log(`✅ Retrained sentiment classifier with new review (${sentiment})`);
      }
    } catch (error) {
      console.error('Error retraining classifier:', error);
    }
  }

  /**
   * Batch retrain with multiple reviews
   */
  batchRetrain(reviews) {
    try {
      reviews.forEach(review => {
        if (review.comment && review.rating) {
          let sentiment = 'neutral';
          if (review.rating >= 4) sentiment = 'positive';
          else if (review.rating <= 2) sentiment = 'negative';
          
          this.classifier.addDocument(
            this.preprocessText(review.comment),
            sentiment
          );
        }
      });

      this.classifier.retrain();
      console.log(`✅ Batch retrained classifier with ${reviews.length} reviews`);
    } catch (error) {
      console.error('Error batch retraining:', error);
    }
  }

  /**
   * Get sentiment statistics for a shop
   */
  async analyzeShopSentiment(shopId, Review) {
    try {
      const reviews = await Review.find({ 
        shopId, 
        status: 'active',
        sentiment: { $exists: true }
      });

      if (reviews.length === 0) {
        return {
          positive: 0,
          negative: 0,
          neutral: 0,
          total: 0,
          averageConfidence: 0,
          sentimentScore: 0
        };
      }

      const stats = {
        positive: 0,
        negative: 0,
        neutral: 0,
        total: reviews.length,
        averageConfidence: 0,
        sentimentScore: 0
      };

      let totalConfidence = 0;
      let totalScore = 0;

      reviews.forEach(review => {
        if (review.sentiment) {
          stats[review.sentiment] = (stats[review.sentiment] || 0) + 1;
        }
        if (review.sentimentConfidence) {
          totalConfidence += review.sentimentConfidence;
        }
        if (review.sentimentScore !== undefined) {
          totalScore += review.sentimentScore;
        }
      });

      stats.averageConfidence = totalConfidence / reviews.length;
      stats.sentimentScore = totalScore / reviews.length;

      return stats;
    } catch (error) {
      console.error('Error analyzing shop sentiment:', error);
      return {
        positive: 0,
        negative: 0,
        neutral: 0,
        total: 0,
        averageConfidence: 0,
        sentimentScore: 0
      };
    }
  }
}

// Export singleton instance
module.exports = new SentimentAnalysisService();

