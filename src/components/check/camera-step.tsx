import { Ionicons } from '@expo/vector-icons';
import { CameraView } from 'expo-camera';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import type { RefObject } from 'react';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';

type Props = {
  hasPermission: boolean;
  photoUri: string | null;
  cameraRef: RefObject<CameraView | null>;
  onTakePhoto: () => void;
  onUsePhoto: () => void;
  onRetake: () => void;
  onRequestPermission: () => void;
};

export function CameraStep({
  hasPermission,
  photoUri,
  cameraRef,
  onTakePhoto,
  onUsePhoto,
  onRetake,
  onRequestPermission,
}: Props) {
  return (
    <View style={styles.cameraContainer}>
      {hasPermission ? (
        photoUri ? (
          <ScrollView contentContainerStyle={styles.centerContent} showsVerticalScrollIndicator={false}>
            <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
            <ThemedText type="small" themeColor="textSecondary" style={styles.centerHint}>
              Verifica que se te vea bien antes de continuar.
            </ThemedText>
            <PrimaryButton title="Usar esta foto" onPress={onUsePhoto} style={styles.wide} />
            <PrimaryButton title="Retomar" onPress={onRetake} variant="secondary" style={styles.wide} />
          </ScrollView>
        ) : (
          <View style={styles.cameraFill}>
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing="front"
              mode="picture"
              flash="off"
              pointerEvents="none"
            />
            <View style={styles.cameraHint}>
              <ThemedText type="smallBold" style={styles.cameraHintText}>
                Tómate una foto como evidencia de presencia
              </ThemedText>
            </View>
            <View style={styles.cameraAction}>
              <PrimaryButton title="Tomar foto" onPress={onTakePhoto} style={styles.wide} />
            </View>
          </View>
        )
      ) : (
        <ScrollView contentContainerStyle={styles.centerContent} showsVerticalScrollIndicator={false}>
          <Ionicons name="camera" size={72} color="#2F5F96" />
          <ThemedText type="subtitle" style={styles.centerTitle}>
            Permiso de cámara
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centerHint}>
            Necesitamos tu cámara para tomar la evidencia de tu checada.
          </ThemedText>
          <PrimaryButton title="Permitir cámara" onPress={onRequestPermission} style={styles.wide} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cameraContainer: {
    flex: 1,
    minHeight: 0,
  },
  cameraFill: {
    flex: 1,
    minHeight: 0,
  },
  camera: {
    flex: 1,
  },
  cameraHint: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  cameraHintText: {
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  cameraAction: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    zIndex: 2,
    elevation: 2,
  },
  photoPreview: {
    width: 220,
    height: 220,
    borderRadius: 24,
  },
  centerContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 24,
    paddingBottom: 32,
  },
  centerTitle: {
    textAlign: 'center',
  },
  centerHint: {
    textAlign: 'center',
  },
  wide: {
    alignSelf: 'stretch',
  },
});
