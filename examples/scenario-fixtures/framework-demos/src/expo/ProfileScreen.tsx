import { Image, Pressable, TextInput, TouchableOpacity } from "react-native";

export function ProfileScreen() {
  return (
    <>
      <Pressable>
        <Icon />
      </Pressable>
      <TouchableOpacity accessibilityLabel="Save profile">
        <Icon />
      </TouchableOpacity>
      <Image source={{ uri: avatarUrl }} />
      <TextInput placeholder="Email" />
    </>
  );
}

const avatarUrl = "https://example.com/avatar.png";

function Icon() {
  return null;
}
