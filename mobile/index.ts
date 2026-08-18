import { registerRootComponent } from 'expo';
// Register native background tasks before root component mounts
import './services/geofence-task';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

