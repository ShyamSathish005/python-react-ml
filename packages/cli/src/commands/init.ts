import fs from 'fs';
import path from 'path';
import ora from 'ora';

export interface InitOptions {
  template: string;
}

const templates = {
  basic: {
    name: 'Basic Python Model',
    files: {
      'model.py': `"""
Basic Python ML model template for Python React ML

This template provides a starting point for creating ML models
that can be used in React and React Native applications.
"""

import numpy as np

# Example: Simple linear regression model
class SimpleModel:
    def __init__(self):
        # Initialize your model here
        self.weights = np.array([1.0, 0.5])
        self.bias = 0.1
    
    def predict_single(self, features):
        """Predict for a single sample"""
        return np.dot(features, self.weights) + self.bias
    
    def predict_batch(self, features_batch):
        """Predict for multiple samples"""
        return np.dot(features_batch, self.weights) + self.bias

# Global model instance
model = SimpleModel()

def predict(input_data):
    """
    Main prediction function - this is required!
    
    Args:
        input_data: Input features (list or numpy array)
    
    Returns:
        Prediction result
    """
    try:
        features = np.array(input_data)
        
        if features.ndim == 1:
            # Single prediction
            return float(model.predict_single(features))
        else:
            # Batch prediction
            return model.predict_batch(features).tolist()
    except Exception as e:
        raise Exception(f"Prediction failed: {str(e)}")

def get_model_info():
    """
    Optional function to provide model information
    
    Returns:
        Dictionary with model metadata
    """
    return {
        "name": "Simple Linear Model",
        "version": "1.0.0",
        "type": "regression",
        "input_shape": [2],
        "output_shape": [1],
        "description": "A simple linear regression model for demonstration"
    }
`,
      'README.md': `# Python React ML Project

This project was created using the Python React ML CLI.

## Files

- \`model.py\` - Your Python ML model
- \`package.json\` - Node.js dependencies for React integration
- \`README.md\` - This file

## Usage

### 1. Develop your model
Edit \`model.py\` to implement your machine learning model. Make sure to:
- Implement a \`predict(input_data)\` function
- Handle both single and batch predictions
- Add proper error handling

### 2. Validate your model
\`\`\`bash
python-react-ml validate model.py
\`\`\`

### 3. Bundle for deployment
\`\`\`bash
python-react-ml bundle model.py -o my-model.bundle.zip
\`\`\`

### 4. Use in React
\`\`\`jsx
import { useModel } from '@python-react-ml/react';

function MyComponent() {
  const { model, status, predict } = useModel('/path/to/my-model.bundle.zip');
  
  const handlePredict = async () => {
    if (model) {
      const result = await predict([1.0, 2.0]);
      console.log('Prediction:', result);
    }
  };
  
  return (
    <div>
      <p>Status: {status}</p>
      <button onClick={handlePredict} disabled={status !== 'ready'}>
        Predict
      </button>
    </div>
  );
}
\`\`\`

## Documentation

Visit [GitHub](https://github.com/yourusername/python-react-ml) for full documentation.
`,
      'package.json': `{
  "name": "my-python-react-ml-project",
  "version": "1.0.0",
  "description": "Python React ML project",
  "main": "index.js",
  "scripts": {
    "validate": "python-react-ml validate model.py",
    "bundle": "python-react-ml bundle model.py",
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@python-react-ml/core": "^0.1.0",
    "@python-react-ml/react": "^0.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@python-react-ml/cli": "^0.1.0",
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^4.4.0"
  }
}`
    }
  }
};

export async function initProject(projectName?: string, options: InitOptions = { template: 'basic' }): Promise<void> {
  const spinner = ora('Initializing Python React ML project...').start();

  try {
    const name = projectName || 'python-react-ml-project';
    const projectPath = path.resolve(name);

    // Check if directory already exists
    if (fs.existsSync(projectPath)) {
      throw new Error(`Directory already exists: ${projectPath}`);
    }

    const template = templates[options.template as keyof typeof templates];
    if (!template) {
      throw new Error(`Unknown template: ${options.template}`);
    }

    spinner.text = `Creating project directory: ${name}`;
    fs.mkdirSync(projectPath, { recursive: true });

    spinner.text = 'Creating project files...';
    
    // Create files from template
    for (const [filename, content] of Object.entries(template.files)) {
      const filePath = path.join(projectPath, filename);
      
      // Replace template variables
      const processedContent = content
        .replace(/my-python-react-ml-project/g, name)
        .replace(/My Python React ML Project/g, name.split('-').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' '));
      
      fs.writeFileSync(filePath, processedContent);
    }

    spinner.succeed(`Project initialized: ${name}`);
    
    console.log(`\nNext steps:`);
    console.log(`  cd ${name}`);
    console.log(`  npm install`);
    console.log(`  python-react-ml validate model.py`);
    console.log(`  python-react-ml bundle model.py\n`);
  } catch (error) {
    spinner.fail('Project initialization failed');
    throw error;
  }
}