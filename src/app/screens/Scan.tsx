// Screen 5: capture a receipt (wireframe scan.html). Live camera picture with
// a frame, or a photo from the gallery; then the upload and the recognition
// on the server, with progress.

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, uploadScan } from '../api';
import { draftFromScan, storeDraft } from '../draft';
import { useGroup } from '../group';
import { navigate } from '../router';
import { Button, ErrorNote, Screen } from '../ui';

type Camera = 'starting' | 'on' | 'off';
type Phase = { step: 'idle' } | { step: 'uploading'; share: number } | { step: 'recognising' };

export function Scan() {
  const group = useGroup();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState<Camera>('starting');
  const [phase, setPhase] = useState<Phase>({ step: 'idle' });
  const [error, setError] = useState('');

  // The live picture needs HTTPS and the user's permission. Without either the
  // shutter opens the camera app of the phone instead.
  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera('off');
        return;
      }
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 2560 },
            height: { ideal: 1440 },
          },
        });
        if (cancelled) {
          for (const track of media.getTracks()) track.stop();
          return;
        }
        stream.current = media;
        if (video.current) {
          video.current.srcObject = media;
          await video.current.play().catch(() => undefined);
        }
        setCamera('on');
      } catch {
        if (!cancelled) setCamera('off');
      }
    };
    void start();
    return () => {
      cancelled = true;
      for (const track of stream.current?.getTracks() ?? []) track.stop();
      stream.current = null;
    };
  }, []);

  const send = useCallback(
    async (photo: Blob) => {
      setError('');
      setPhase({ step: 'uploading', share: 0 });
      try {
        const scan = await uploadScan(group.token, photo, (share) => {
          setPhase(share >= 1 ? { step: 'recognising' } : { step: 'uploading', share });
        });
        storeDraft(group.token, draftFromScan(scan, group.me.id));
        navigate(`/g/${group.token}/beleg/neu`, { replace: true });
      } catch (failure) {
        setError(errorMessage(failure));
        setPhase({ step: 'idle' });
      }
    },
    [group.token, group.me.id],
  );

  const takePhoto = async () => {
    const element = video.current;
    const track = stream.current?.getVideoTracks()[0];
    if (camera !== 'on' || !element || !track) {
      cameraInput.current?.click();
      return;
    }
    // A still photo in full sensor resolution where the browser offers it …
    const Capture = (
      window as unknown as {
        ImageCapture?: new (track: MediaStreamTrack) => { takePhoto(): Promise<Blob> };
      }
    ).ImageCapture;
    if (Capture) {
      try {
        void send(await new Capture(track).takePhoto());
        return;
      } catch {
        // … otherwise the current frame of the live picture.
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;
    canvas.getContext('2d')?.drawImage(element, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) void send(blob);
        else setError('Das Foto konnte nicht aufgenommen werden.');
      },
      'image/jpeg',
      0.92,
    );
  };

  const onFile = (input: HTMLInputElement | null) => {
    const file = input?.files?.[0];
    if (input) input.value = '';
    if (file) void send(file);
  };

  const busy = phase.step !== 'idle';

  return (
    <Screen
      title="Zettel scannen"
      back={`/g/${group.token}`}
      footer={
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            tall
            className="flex-1"
            disabled={busy}
            onClick={() => galleryInput.current?.click()}
          >
            Aus Galerie
          </Button>
          <button
            type="button"
            aria-label="Foto aufnehmen"
            disabled={busy}
            onClick={() => void takePhoto()}
            className="flex h-[68px] w-[68px] shrink-0 cursor-pointer items-center justify-center rounded-full border-4 border-accent bg-white p-0 disabled:opacity-50"
          >
            <span className="h-12 w-12 rounded-full bg-accent" />
          </button>
          <div className="flex-1 text-xs text-muted">
            Danach läuft die Erkennung einige Sekunden auf dem Server.
          </div>
        </div>
      }
    >
      <div className="flex h-full flex-col gap-3 p-4">
        <div className="relative flex min-h-[280px] flex-1 items-center justify-center overflow-hidden rounded-lg bg-[#e5e5e5]">
          <video
            ref={video}
            muted
            playsInline
            className={`absolute inset-0 h-full w-full object-cover ${camera === 'on' ? '' : 'hidden'}`}
          />
          {/* The frame shows how to hold the receipt: upright, top to bottom. */}
          <div
            className={`relative box-border flex h-[86%] max-h-[460px] w-[190px] flex-col items-center justify-between rounded-md border-2 border-dashed px-2 py-4 text-center text-[13px] ${
              camera === 'on'
                ? 'border-white text-white [text-shadow:0_0_4px_#000]'
                : 'border-[#3d3d3d] text-[#3d3d3d]'
            }`}
          >
            <span className="font-semibold">oben</span>
            <span>
              {camera === 'on' && 'Zettel in den Rahmen'}
              {camera === 'starting' && 'Kamera startet …'}
              {camera === 'off' && (
                <>
                  Kein Kamerabild.
                  <br />
                  Der Auslöser öffnet die Kamera des Handys.
                </>
              )}
            </span>
            <span className="font-semibold">unten</span>
          </div>

          {busy && (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/90 px-8 text-center"
            >
              <div className="font-semibold">
                {phase.step === 'uploading'
                  ? 'Foto wird hochgeladen …'
                  : 'Positionen werden erkannt …'}
              </div>
              <div className="h-2 w-full max-w-[220px] overflow-hidden rounded-full bg-line">
                {phase.step === 'uploading' ? (
                  <div
                    className="h-full rounded-full bg-accent transition-[width]"
                    style={{ width: `${Math.round(phase.share * 100)}%` }}
                  />
                ) : (
                  <div className="h-full w-1/3 animate-[splitti-progress_1.2s_ease-in-out_infinite] rounded-full bg-accent" />
                )}
              </div>
              <div className="text-[13px] text-muted">
                {phase.step === 'uploading'
                  ? 'Schritt 1 von 2'
                  : 'Schritt 2 von 2 · das dauert einige Sekunden'}
              </div>
            </div>
          )}
        </div>
        <ErrorNote>{error}</ErrorNote>
        <p className="m-0 text-center text-sm text-ink">
          Zettel aufrecht und vollständig fotografieren, von der ersten Position bis zur Summe.
        </p>
      </div>
      <input
        ref={galleryInput}
        type="file"
        accept="image/jpeg,image/png,image/*"
        className="hidden"
        aria-label="Foto aus der Galerie"
        onChange={(event) => onFile(event.currentTarget)}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label="Foto mit der Kamera aufnehmen"
        onChange={(event) => onFile(event.currentTarget)}
      />
    </Screen>
  );
}
