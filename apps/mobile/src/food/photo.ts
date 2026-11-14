import { File } from 'expo-file-system';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import { JPEG_QUALITY, fitWithin } from './photoMath';

/**
 * Prepares a photo for analysis: shrinks it to at most 1024 px and re-encodes it as a JPEG. Re-encoding drops the original file's
 * metadata (such as location) from the copy we send; the camera is also asked not to record EXIF at all. The caller must call
 * `discardPhoto` on every URI it holds when it is done.
 */
export async function preparePhoto(
  uri: string,
  width: number,
  height: number,
): Promise<{ uri: string; width: number; height: number }> {
  const target = fitWithin(width, height);
  const resize = width >= height ? { width: target.width } : { height: target.height };
  const out = await manipulateAsync(uri, [{ resize }], {
    compress: JPEG_QUALITY,
    format: SaveFormat.JPEG,
  });
  return { uri: out.uri, width: out.width, height: out.height };
}

/** Best-effort deletion of a temporary local photo. Never throws: a failure to delete must not block the person. */
export async function discardPhoto(uri: string | null | undefined): Promise<void> {
  if (!uri) return;
  try {
    if (uri.startsWith('blob:') && typeof URL !== 'undefined') {
      URL.revokeObjectURL(uri);
      return;
    }
    if (uri.startsWith('file:')) {
      const f = new File(uri);
      if (f.exists) f.delete();
    }
  } catch {
    /* ignore */
  }
}

export { seedFrom } from './photoMath';
