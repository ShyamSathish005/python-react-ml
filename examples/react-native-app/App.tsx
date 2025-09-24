import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useModelNative } from '@shyamsathish005/python-react-ml-react-native';

function ModelDemo() {
  const { 
    isLoaded, 
    isLoading, 
    error, 
    predict, 
    getInfo,
    loadModel,
    reload 
  } = useModelNative();

  const [inputValues, setInputValues] = useState(['1.0', '2.0', '0.5']);
  const [prediction, setPrediction] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleInputChange = (index: number, value: string) => {
    const newValues = [...inputValues];
    newValues[index] = value;
    setInputValues(newValues);
  };

  const handleLoadModel = async () => {
    try {
      await loadModel('assets/model.bundle.zip');
    } catch (err) {
      Alert.alert('Error', `Failed to load model: ${err}`);
    }
  };

  const handlePredict = async () => {
    if (!isLoaded) return;

    setIsRunning(true);
    try {
      const numericInput = inputValues.map(v => parseFloat(v) || 0);
      const result = await predict(numericInput);
      setPrediction(result);
      Alert.alert('Success', `Prediction: ${result.toFixed(4)}`);
    } catch (err) {
      Alert.alert('Error', `Prediction failed: ${err}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleGetInfo = async () => {
    if (!isLoaded) return;

    try {
      const info = await getInfo();
      Alert.alert(
        'Model Information',
        JSON.stringify(info, null, 2),
        [{ text: 'OK' }]
      );
    } catch (err) {
      Alert.alert('Error', `Failed to get model info: ${err}`);
    }
  };

  const getStatusColor = () => {
    if (error) return '#ef4444';
    if (isLoading) return '#f59e0b';
    if (isLoaded) return '#22c55e';
    return '#6b7280';
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🐍 Python React ML</Text>
        <Text style={styles.subtitle}>React Native Demo</Text>
      </View>

      <View style={styles.statusSection}>
        <View style={styles.statusIndicator}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
          <Text style={styles.statusText}>
            Status: {isLoading ? 'Loading' : isLoaded ? 'Ready' : 'Not Loaded'}
          </Text>
        </View>
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Error: {error}</Text>
          </View>
        )}
      </View>

      {!isLoaded && !isLoading && (
        <TouchableOpacity style={styles.loadButton} onPress={handleLoadModel}>
          <Text style={styles.buttonText}>Load Model</Text>
        </TouchableOpacity>
      )}

      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading Python model...</Text>
        </View>
      )}

      {isLoaded && (
        <View style={styles.modelControls}>
          <View style={styles.inputSection}>
            <Text style={styles.sectionTitle}>Model Input</Text>
            {inputValues.map((value, index) => (
              <View key={index} style={styles.inputRow}>
                <Text style={styles.inputLabel}>Feature {index + 1}:</Text>
                <TextInput
                  style={styles.input}
                  value={value}
                  onChangeText={(text) => handleInputChange(index, text)}
                  placeholder="0.0"
                  keyboardType="numeric"
                  editable={!isRunning}
                />
              </View>
            ))}
            <TouchableOpacity 
              style={[styles.predictButton, isRunning && styles.disabledButton]}
              onPress={handlePredict}
              disabled={isRunning}
            >
              {isRunning ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.buttonText}>Run Prediction</Text>
              )}
            </TouchableOpacity>
          </View>

          {prediction !== null && (
            <View style={styles.predictionSection}>
              <Text style={styles.sectionTitle}>Prediction Result</Text>
              <Text style={styles.predictionValue}>{prediction.toFixed(4)}</Text>
              <Text style={styles.predictionDescription}>
                Probability between 0 and 1
              </Text>
            </View>
          )}

          <View style={styles.actionsSection}>
            <TouchableOpacity style={styles.infoButton} onPress={handleGetInfo}>
              <Text style={styles.buttonText}>Get Model Info</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reloadButton} onPress={reload}>
              <Text style={styles.buttonText}>Reload Model</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

export default function App() {
  return <ModelDemo />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
    paddingVertical: 30,
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
  },
  statusSection: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 20,
    marginBottom: 20,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  errorContainer: {
    marginTop: 15,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
  },
  loadButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#64748b',
  },
  modelControls: {
    gap: 20,
  },
  inputSection: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 15,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  inputLabel: {
    width: 100,
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    backgroundColor: 'white',
  },
  predictButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  disabledButton: {
    backgroundColor: '#9ca3af',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  predictionSection: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
  },
  predictionValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: 'white',
    fontFamily: 'monospace',
    marginVertical: 15,
  },
  predictionDescription: {
    color: 'white',
    fontSize: 14,
    opacity: 0.9,
  },
  actionsSection: {
    flexDirection: 'row',
    gap: 15,
    justifyContent: 'center',
  },
  infoButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
  },
  reloadButton: {
    backgroundColor: '#f59e0b',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
  },
});