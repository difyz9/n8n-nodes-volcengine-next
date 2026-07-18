import assert from 'node:assert/strict';
import test from 'node:test';
import mediaUtils from '../dist/nodes/shared/media-utils.js';

const { dataUrl, filterModelIds } = mediaUtils;

test('filters known model families while preserving custom endpoint IDs', () => {
	const ids = ['doubao-seed-1-6', 'doubao-seedream-5-0-lite', 'doubao-seedance-2-0', 'ep-custom'];
	assert.deepEqual(filterModelIds(ids, 'image'), ['doubao-seedream-5-0-lite', 'ep-custom']);
	assert.deepEqual(filterModelIds(ids, 'video'), ['doubao-seedance-2-0', 'ep-custom']);
	assert.deepEqual(filterModelIds(ids, 'chat'), ['doubao-seed-1-6', 'ep-custom']);
});

test('builds data URLs with the supplied MIME type and a safe fallback', () => {
	const buffer = Buffer.from('hello');
	assert.equal(dataUrl(buffer, 'image/png'), 'data:image/png;base64,aGVsbG8=');
	assert.equal(dataUrl(buffer), 'data:application/octet-stream;base64,aGVsbG8=');
});
