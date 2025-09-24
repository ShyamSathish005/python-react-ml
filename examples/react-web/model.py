"""
Example ML model for Python React ML
Simple regression model for demonstration
"""

import math

# Simple model state
model_weights = [0.5, 1.2, -0.3]
model_bias = 0.1

def predict(input_data):
    """
    Main prediction function - this is required!
    
    Performs a simple linear regression prediction
    """
    try:
        # Handle both single predictions and batches
        if isinstance(input_data, list) and len(input_data) > 0:
            if isinstance(input_data[0], list):
                # Batch prediction
                return [predict_single(sample) for sample in input_data]
            else:
                # Single prediction
                return predict_single(input_data)
        else:
            raise ValueError("Input must be a non-empty list")
            
    except Exception as e:
        raise Exception(f"Prediction failed: {str(e)}")

def predict_single(features):
    """Predict for a single sample"""
    if len(features) != len(model_weights):
        raise ValueError(f"Expected {len(model_weights)} features, got {len(features)}")
    
    # Simple dot product + bias
    result = sum(w * f for w, f in zip(model_weights, features)) + model_bias
    
    # Apply activation (sigmoid for demo)
    return 1 / (1 + math.exp(-result))

def get_model_info():
    """
    Optional function to provide model information
    """
    return {
        "name": "Simple Demo Model",
        "version": "1.0.0", 
        "type": "regression",
        "description": "A simple linear regression model for demonstration",
        "input_features": ["feature_1", "feature_2", "feature_3"],
        "output_type": "probability",
        "weights": model_weights,
        "bias": model_bias
    }

# Optional: Model training function (not used in prediction)
def train(X, y, epochs=100, lr=0.01):
    """
    Simple gradient descent training
    This function is not required for prediction but shows
    how you might include training logic
    """
    global model_weights, model_bias
    
    for epoch in range(epochs):
        for i in range(len(X)):
            # Forward pass
            prediction = predict_single(X[i])
            
            # Compute loss (MSE derivative)
            error = prediction - y[i]
            
            # Backward pass
            for j in range(len(model_weights)):
                model_weights[j] -= lr * error * X[i][j]
            model_bias -= lr * error
    
    return {"trained_epochs": epochs, "final_weights": model_weights, "final_bias": model_bias}