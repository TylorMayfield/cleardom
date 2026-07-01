export function ProfileScreen() {
  return (
    <View>
      <Pressable>
        <Icon />
      </Pressable>
      <TouchableOpacity accessibilityLabel="Edit profile" accessibilityRole="button">
        <Icon />
      </TouchableOpacity>
      <TextInput placeholder="Email" />
      <Image source={{ uri: avatarUrl }} />
    </View>
  );
}

function Icon() {
  return <View />;
}

