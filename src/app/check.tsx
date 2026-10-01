import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { CenteredLoader } from '@/components/centered-loader';
import { BiometricStep } from '@/components/check/biometric-step';
import { CameraStep } from '@/components/check/camera-step';
import { LocationStep, LocationStepState } from '@/components/check/location-step';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/auth-context';
import { authenticateWithBiometrics, isBiometricAvailable } from '@/lib/biometrics';
import { getCheckMeta, parseCheckKind } from '@/lib/checks';
import { getOperationId } from '@/lib/device';
import { getFriendlyError } from '@/lib/errors';
import { getLocationFix, hasLocationServices, requestLocationPermission } from '@/lib/location';
import { assertOnline } from '@/lib/network';
import { getBiometricsEnabled } from '@/lib/settings';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/use-theme';
import { Attendance, LocationFix, SessionState } from '@/types';

type Step = 'init' | 'biometric' | 'camera' | 'location' | 'submitting';

const MAX_TRUSTED_ACCURACY = 100;

export default function CheckScreen() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const rawKind = parseCheckKind(params.kind);
  const { profile, device, isDeviceUsable } = useAuth();
  const theme = useTheme();
  const cameraRef = useRef<CameraView>(null);
  const opRef = useRef<string | null>(null);
  const uploadedPathRef = useRef<string | null>(null);

  const [meta, setMeta] = useState(() => getCheckMeta(rawKind ?? 'check_in'));
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('init');
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [locState, setLocState] = useState<LocationStepState>('idle');
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [locMessage, setLocMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const branch = profile?.branch ?? null;

  useEffect(() => {
    (async () => {
      const requested = parseCheckKind(params.kind);
      if (!requested) {
        setFatal('Checada no válida. Regresa e inténtalo de nuevo.');
        return;
      }
      setMeta(getCheckMeta(requested));

      if (!branch) {
        setFatal('No tienes una sucursal asignada. Contacta al administrador.');
        return;
      }

      if (device != null && !isDeviceUsable) {
        setFatal('Este dispositivo está desactivado. Contacta al administrador.');
        return;
      }

      const { data, error } = await supabase.rpc('my_session_state');
      if (error) {
        setFatal(getFriendlyError(error));
        return;
      }
      const state = (data ?? null) as SessionState | null;
      if (!state || state.next_check !== requested) {
        setFatal(
          `No puedes registrar ${getCheckMeta(requested).shortTitle.toLowerCase()} en este momento.`
        );
        return;
      }
      if (requested === 'check_in' && state.entry_window?.allowed !== true) {
        setFatal(
          state.entry_window?.message ??
            'No se pudo validar tu horario. Inténtalo de nuevo en unos momentos.'
        );
        return;
      }
      if (requested !== 'check_in' && !state.session?.id) {
        setFatal('No hay una jornada abierta. Registra tu entrada primero.');
        return;
      }
      setOpenSessionId(state.session?.id ?? null);

      const enabled = await getBiometricsEnabled();
      const available = await isBiometricAvailable();
      setBioAvailable(available);
      setStep(enabled && available ? 'biometric' : 'camera');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tryBiometric = useCallback(async () => {
    setBioError(null);
    const ok = await authenticateWithBiometrics(`Confirma tu identidad para ${meta.verb.toLowerCase()}`);
    if (ok) {
      setStep('camera');
    } else {
      setBioError('No se pudo confirmar tu identidad con biometría.');
    }
  }, [meta]);

  useEffect(() => {
    if (step !== 'biometric' || bioError) return;
    const frame = requestAnimationFrame(() => {
      tryBiometric().catch(() => setBioError('Ocurrió un error al usar la biometría.'));
    });
    return () => cancelAnimationFrame(frame);
  }, [step, bioError, tryBiometric]);

  const locate = useCallback(async () => {
    setLocState('locating');
    setLocMessage(null);
    setSubmitError(null);
    try {
      const services = await hasLocationServices();
      if (!services) {
        setLocState('unavailable');
        setLocMessage('Los servicios de ubicación están apagados. La checada requiere tu ubicación.');
        return;
      }
      const granted = await requestLocationPermission();
      if (!granted) {
        setLocState('unavailable');
        setLocMessage('El permiso de ubicación es necesario para registrar tu asistencia.');
        return;
      }
      if (!branch) return;
      const { fix: loc, mocked: isMocked } = await getLocationFix(branch.lat, branch.lon);
      if (isMocked) {
        setLocState('error');
        setLocMessage('Se detectó ubicación simulada. No se puede registrar la checada.');
        return;
      }
      if (loc.accuracy != null && loc.accuracy > MAX_TRUSTED_ACCURACY) {
        setLocState('error');
        setLocMessage('La precisión del GPS es insuficiente. Aléjate de obstáculos y reintenta.');
        return;
      }
      setFix(loc);
      setLocState('done');
    } catch (err) {
      setLocState('error');
      const message = err instanceof Error ? err.message : '';
      setLocMessage(
        /timed out|timeout expired/i.test(message)
          ? 'La ubicación tardó demasiado. Activa el GPS, acércate a una ventana e inténtalo de nuevo.'
          : message || 'No se pudo obtener tu ubicación. Revisa el GPS y los permisos e inténtalo de nuevo.'
      );
    }
  }, [branch]);

  useEffect(() => {
    if (step === 'location' && !fatal) {
      const frame = requestAnimationFrame(() => {
        locate();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [step, fatal, locate]);

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    const picture = await cameraRef.current.takePictureAsync({
      quality: 0.6,
    });
    setPhotoUri(picture.uri);
  };

  const effectiveAccuracy = fix ? Math.min(fix.accuracy ?? MAX_TRUSTED_ACCURACY, MAX_TRUSTED_ACCURACY) : 0;
  const radiusAllowed = branch && fix ? branch.radius_m + effectiveAccuracy : 0;
  const withinRange = fix !== null && fix.distanceToBranch <= radiusAllowed;
  const canSubmitLocation = locState === 'done' && withinRange && photoUri != null;

  const uploadPhoto = useCallback(async (opId: string): Promise<string | null> => {
    if (!photoUri || !profile?.employee.id) return null;
    if (uploadedPathRef.current) return uploadedPathRef.current;
    const path = `${profile.employee.id}/${meta.kind}-${Date.now()}-${opId}.jpg`;
    const localPhoto = await fetch(photoUri);
    if (!localPhoto.ok) throw new Error('No se pudo leer la foto de evidencia. Tómala de nuevo e inténtalo.');
    const photoBytes = await localPhoto.arrayBuffer();
    if (photoBytes.byteLength === 0) throw new Error('La foto de evidencia está vacía. Tómala de nuevo e inténtalo.');
    const { error: uploadError } = await supabase.storage
      .from('attendance-evidence')
      .upload(path, photoBytes, { contentType: 'image/jpeg', upsert: false });
    if (uploadError) throw uploadError;
    uploadedPathRef.current = path;
    return path;
  }, [profile, meta.kind, photoUri]);

  const submit = useCallback(async () => {
    if (step === 'submitting' || !branch || !canSubmitLocation) return;
    setSubmitError(null);
    try {
      if (!opRef.current) opRef.current = await getOperationId();
      const opId = opRef.current;

      await assertOnline();

      setStep('submitting');
      const photoPath = await uploadPhoto(opId);

      const common = {
        p_lat: fix?.lat ?? null,
        p_lon: fix?.lon ?? null,
        p_accuracy_m: fix ? effectiveAccuracy : null,
        p_device_id: device?.id ?? null,
        p_idempotency_key: opId,
      };

      let result: Attendance;
      if (meta.kind === 'check_in') {
        const { data, error } = await supabase.rpc('record_check_in', {
          p_branch_id: branch.id,
          ...common,
          p_photo_path: photoPath,
        });
        if (error) throw error;
        result = data as Attendance;
      } else {
        if (!openSessionId) throw new Error('No se encontró tu jornada abierta.');
        const rpcName =
          meta.kind === 'check_out'
            ? 'record_check_out'
            : meta.kind === 'break_out'
              ? 'record_break_out'
              : 'record_break_in';
        const { data, error } = await supabase.rpc(rpcName, {
          p_attendance_id: openSessionId,
          p_photo_path: photoPath,
          ...common,
        });
        if (error) throw error;
        result = data as Attendance;
      }

      router.replace(`/confirm?kind=${meta.kind}&session=${result.id}`);
    } catch (err) {
      setSubmitError(getFriendlyError(err));
      setStep('location');
    }
  }, [step, branch, canSubmitLocation, fix, device, meta.kind, openSessionId, effectiveAccuracy, uploadPhoto]);

  const close = () => router.back();
  const submitting = step === 'submitting';

  if (fatal) {
    return (
      <SafeAreaProvider>
        <SafeAreaView
          style={[styles.container, { backgroundColor: theme.background }]}
          edges={['top', 'bottom', 'left', 'right']}>
          <ThemedView style={styles.fatalCard}>
            <Ionicons name="alert-circle" size={40} color="#B93A3A" />
            <ThemedText style={styles.fatalTitle}>{fatal}</ThemedText>
            <PrimaryButton title="Volver" onPress={close} />
          </ThemedView>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (step === 'init') {
    return <CenteredLoader message="Preparando tu checada…" />;
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
        edges={['top', 'bottom', 'left', 'right']}>
        <ScreenHeader title={meta.title} backLabel="Cancelar" onBack={close} />

        {step === 'biometric' && (
          <BiometricStep
            bioAvailable={bioAvailable}
            bioError={bioError}
            onUseBiometric={() => tryBiometric()}
            onSkipBiometric={() => setStep('camera')}
          />
        )}

        {step === 'camera' && (
          <CameraStep
            hasPermission={cameraPermission?.granted ?? false}
            photoUri={photoUri}
            cameraRef={cameraRef}
            onTakePhoto={takePhoto}
            onUsePhoto={() => setStep('location')}
            onRetake={() => setPhotoUri(null)}
            onRequestPermission={() => requestCameraPermission()}
          />
        )}

        {step === 'location' && (
          <LocationStep
            locState={locState}
            locMessage={locMessage}
            branchName={branch?.name}
            fix={fix}
            withinRange={withinRange}
            submitError={submitError}
            submitting={submitting}
            canSubmit={canSubmitLocation}
            verb={meta.verb}
            onRetry={locate}
            onSubmit={submit}
          />
        )}

        {step === 'submitting' && <CenteredLoader message="Validando y guardando tu checada…" />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fatalCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  fatalTitle: {
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 17,
  },
});
