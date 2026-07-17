import { Pressable, Text, View } from "react-native";
export default function App() { return <View><Text accessibilityRole="header">Account</Text><Pressable accessibilityRole="button" accessibilityLabel="Save profile"><Text>Save profile</Text></Pressable></View>; }
