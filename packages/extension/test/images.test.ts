import { mkdir, mkdtemp, readdir, readFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChatImages } from '../src/control/chatImages';
import type { Activity } from '../src/sessions/activityParts';
import { projectDetail, projectSummary } from '../src/sessions/projection';
import { MAX_SHOWN_IMAGE_BYTES, requestImage } from '../src/sessions/requestImages';
import { request, snapshot } from './fixtures';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 3]);
const BATCH = '0f8fad5b-d9cb-469f-a165-70867728950e';
const quiet: Activity = { statuses: new Map(), events: [], toolsOnly: false, settled: false };

const indexed = (bytes: Buffer): Record<string, number> =>
  Object.fromEntries([...bytes].map((byte, index) => [String(index), byte]));

const photoRequest = (): Record<string, unknown> => ({
  ...request('r1', 'look', 1),
  variableData: {
    variables: [
      { id: 'a.ts', kind: 'file', name: 'a.ts' },
      {
        id: 'logged',
        kind: 'image',
        name: 'Pasted Image',
        mimeType: 'image/png',
        value: { $base64: PNG.toString('base64') }
      },
      {
        id: 'exported',
        kind: 'image',
        name: 'photo-1.jpg',
        mimeType: 'image/jpeg',
        value: indexed(JPEG)
      },
      { id: 'array', kind: 'image', mimeType: 'image/png', value: [...PNG] },
      {
        id: 'attached',
        kind: 'image',
        name: 'photo-2.jpg',
        isFile: false,
        value: { $base64: JPEG.toString('base64') }
      },
      { id: 'vector', kind: 'image', mimeType: 'image/svg+xml', value: [60, 115] },
      { id: 'omitted', kind: 'image', mimeType: 'image/png' }
    ]
  }
});

describe('request images', () => {
  it('projects displayable images', () => {
    const root = snapshot([photoRequest()]);
    const detail = projectDetail(root, projectSummary(root, 'file', 0), 1, quiet, []);
    expect(detail.requests[0]?.images).toEqual([
      { id: 'logged', name: 'Pasted Image', mimeType: 'image/png' },
      { id: 'exported', name: 'photo-1.jpg', mimeType: 'image/jpeg' },
      { id: 'array', name: 'Image', mimeType: 'image/png' },
      { id: 'attached', name: 'photo-2.jpg', mimeType: 'image/jpeg' }
    ]);
  });

  it.each([
    ['logged', PNG],
    ['exported', JPEG],
    ['array', PNG],
    ['attached', JPEG]
  ])('decodes %s image bytes', (id, bytes) => {
    expect(requestImage(photoRequest(), id)?.data).toBe(bytes.toString('base64'));
  });

  it.each(['vector', 'omitted', 'missing'])('has no data for %s image', (id) => {
    expect(requestImage(photoRequest(), id)).toBeNull();
  });

  it('refuses images too large to send to the phone', () => {
    const huge = {
      ...request('r1', 'look', 1),
      variableData: {
        variables: [
          {
            id: 'huge',
            kind: 'image',
            mimeType: 'image/png',
            value: { $base64: Buffer.alloc(MAX_SHOWN_IMAGE_BYTES + 1).toString('base64') }
          }
        ]
      }
    };
    expect(() => requestImage(huge, 'huge')).toThrow('Photo is too large to show');
  });
});

describe('chat images', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pocket-pilot-images-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes photos into a fresh batch folder', async () => {
    const images = new ChatImages(dir);
    const paths = await images.write([
      { mimeType: 'image/jpeg', data: JPEG.toString('base64') },
      { mimeType: 'image/png', data: PNG.toString('base64') }
    ]);
    expect(paths.map((path) => basename(path))).toEqual(['photo-1.jpg', 'photo-2.png']);
    expect(await readFile(paths[1] ?? '')).toEqual(PNG);
    expect(await images.write([])).toEqual([]);
  });

  it('rejects data that does not match its type', async () => {
    const images = new ChatImages(dir);
    await expect(
      images.write([{ mimeType: 'image/jpeg', data: PNG.toString('base64') }])
    ).rejects.toThrow('Photo is not a valid JPEG or PNG image');
    expect(await readdir(dir)).toEqual([]);
  });

  it('prunes only old photo batches', async () => {
    const images = new ChatImages(dir);
    const fresh = await images.write([{ mimeType: 'image/png', data: PNG.toString('base64') }]);
    await Promise.all([mkdir(join(dir, BATCH)), mkdir(join(dir, 'keep'))]);
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await Promise.all([utimes(join(dir, BATCH), old, old), utimes(join(dir, 'keep'), old, old)]);
    await images.prune();
    expect((await readdir(dir)).sort()).toEqual(
      [...fresh.map((path) => basename(dirname(path))), 'keep'].sort()
    );
  });
});
