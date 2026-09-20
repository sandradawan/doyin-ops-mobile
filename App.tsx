import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";

// See full source on disk — truncated push recovery
// Full App will be restored in next commit if needed.

type Tab = "home" | "cash" | "scripts" | "pipeline" | "tasks";

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0b1220", padding: 20 }}>
      <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800" }}>DoyinOps</Text>
      <Text style={{ color: "#94a3b8", marginTop: 8 }}>
        Full app source is in the repo workspace. Re-push complete App.tsx if this placeholder appears.
      </Text>
    </SafeAreaView>
  );
}
