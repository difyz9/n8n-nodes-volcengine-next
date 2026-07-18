export type ArkModelKind = 'chat' | 'image' | 'video';

function knownModelKind(modelId: string): ArkModelKind | undefined {
	const id = modelId.toLowerCase();
	if (id.includes('seedream') || id.includes('image')) return 'image';
	if (id.includes('seedance') || id.includes('video')) return 'video';
	if (id.includes('doubao') || id.includes('deepseek')) return 'chat';
	return undefined;
}

/** Keep endpoint/custom IDs because their capability cannot be inferred from the ID. */
export function filterModelIds(ids: string[], kind: ArkModelKind): string[] {
	return ids.filter((id) => {
		const detected = knownModelKind(id);
		return detected === undefined || detected === kind;
	});
}

export function dataUrl(buffer: Buffer, mimeType?: string, fallback = 'application/octet-stream'): string {
	return `data:${mimeType || fallback};base64,${buffer.toString('base64')}`;
}
