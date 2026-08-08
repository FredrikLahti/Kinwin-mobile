import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.crimsonBright,
        tabBarInactiveTintColor: theme.colors.warmGrey,
        tabBarStyle: {
          height: 68,
          paddingTop: 8,
          paddingBottom: 10,
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.structureLineStrong,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarAccessibilityLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Feather color={color} name="home" size={size} />,
        }}
      />
      <Tabs.Screen
        name="kin"
        options={{
          title: 'Kin',
          tabBarAccessibilityLabel: 'Kin',
          tabBarIcon: ({ color, size }) => <Feather color={color} name="users" size={size} />,
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: 'Me',
          tabBarAccessibilityLabel: 'Me',
          tabBarIcon: ({ color, size }) => <Feather color={color} name="user" size={size} />,
        }}
      />
      <Tabs.Screen name="progress" options={{ href: null }} />
      <Tabs.Screen name="coming-soon" options={{ href: null }} />
    </Tabs>
  );
}
