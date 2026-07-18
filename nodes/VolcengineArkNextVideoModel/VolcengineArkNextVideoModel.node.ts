import {
	type IDataObject,
	type IExecuteFunctions,
	type ILoadOptionsFunctions,
	type INodeExecutionData,
	type INodePropertyOptions,
	type INodeType,
	type INodeTypeDescription,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';
import { dataUrl, filterModelIds } from '../shared/media-utils';

function normalizeBaseUrl(url: string): string {
	return String(url).trim().replace(/\/+$/, '');
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

const STATIC_VIDEO_MODEL_IDS = [
	'doubao-seedance-2-0',
	'doubao-seedance-2-0-mini',
	'doubao-seedance-1-5-pro',
	'doubao-seedance-1-0-pro',
] as const;

async function getModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const credentials = await this.getCredentials('volcengineArkNextApi');
	const apiKey = credentials.apiKey as string;
	const baseUrl = normalizeBaseUrl((credentials.baseUrl as string) || 'https://ark.cn-beijing.volces.com/api/v3');
	try {
		const response = (await this.helpers.httpRequest({
			method: 'GET',
			url: `${baseUrl}/models`,
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
			json: true,
		})) as { data?: Array<{ id?: string }> };

		const data = response?.data;
		if (!Array.isArray(data)) {
			throw new Error('Unexpected /models response shape');
		}
		const ids = data.map((m) => (typeof m?.id === 'string' ? m.id : '')).filter((id): id is string => Boolean(id));
		const unique = filterModelIds([...new Set(ids)], 'video').sort((a, b) => a.localeCompare(b));
		if (unique.length === 0) {
			throw new Error('Empty /models data array');
		}
		return unique.map((name) => ({ name, value: name }));
	} catch {
		return [...STATIC_VIDEO_MODEL_IDS].map((name) => ({ name, value: name }));
	}
}

async function buildMultiModalContent(executionFn: IExecuteFunctions, itemIndex: number): Promise<unknown[]> {
	const content: unknown[] = [];

	const prompt = executionFn.getNodeParameter('prompt', itemIndex, '') as string;
	if (prompt) {
		content.push({ type: 'text', text: prompt });
	}

	const refImageSource = executionFn.getNodeParameter('refImageSourceType', itemIndex, 'none') as string;

	if (refImageSource === 'url') {
		const urlsStr = executionFn.getNodeParameter('refImageUrls', itemIndex, '') as string;
		const urls = urlsStr
			.split('\n')
			.map((u) => u.trim())
			.filter(Boolean);
		for (const url of urls.slice(0, 9)) {
			content.push({
				type: 'image_url',
				image_url: { url },
				role: 'reference_image',
			});
		}
	} else if (refImageSource === 'binary') {
		const propsStr = executionFn.getNodeParameter('refImageBinaryProperties', itemIndex, '') as string;
		const props = propsStr
			.split(',')
			.map((p) => p.trim())
			.filter(Boolean);
		for (const prop of props.slice(0, 9)) {
			const binaryData = executionFn.helpers.assertBinaryData(itemIndex, prop);
			const buffer = await executionFn.helpers.getBinaryDataBuffer(itemIndex, prop);
			if (buffer) {
				content.push({
					type: 'image_url',
					image_url: {
						url: dataUrl(buffer, binaryData.mimeType, 'image/jpeg'),
					},
					role: 'reference_image',
				});
			}
		}
	}

	const refVideoSource = executionFn.getNodeParameter('refVideoSourceType', itemIndex, 'none') as string;

	if (refVideoSource === 'url') {
		const urlsStr = executionFn.getNodeParameter('refVideoUrls', itemIndex, '') as string;
		const urls = urlsStr
			.split('\n')
			.map((u) => u.trim())
			.filter(Boolean);
		for (const url of urls.slice(0, 3)) {
			content.push({
				type: 'video_url',
				video_url: { url, role: 'reference_video' },
			});
		}
	} else if (refVideoSource === 'binary') {
		const propsStr = executionFn.getNodeParameter('refVideoBinaryProperties', itemIndex, '') as string;
		const props = propsStr
			.split(',')
			.map((p) => p.trim())
			.filter(Boolean);
		for (const prop of props.slice(0, 3)) {
			const binaryData = executionFn.helpers.assertBinaryData(itemIndex, prop);
			const buffer = await executionFn.helpers.getBinaryDataBuffer(itemIndex, prop);
			if (buffer) {
				content.push({
					type: 'video_url',
					video_url: {
						url: dataUrl(buffer, binaryData.mimeType, 'video/mp4'),
						role: 'reference_video',
					},
				});
			}
		}
	}

	const refAudioSource = executionFn.getNodeParameter('refAudioSourceType', itemIndex, 'none') as string;

	if (refAudioSource === 'url') {
		const urlsStr = executionFn.getNodeParameter('refAudioUrls', itemIndex, '') as string;
		const urls = urlsStr
			.split('\n')
			.map((u) => u.trim())
			.filter(Boolean);
		for (const url of urls.slice(0, 3)) {
			content.push({
				type: 'audio_url',
				audio_url: { url, role: 'reference_audio' },
			});
		}
	} else if (refAudioSource === 'binary') {
		const propsStr = executionFn.getNodeParameter('refAudioBinaryProperties', itemIndex, '') as string;
		const props = propsStr
			.split(',')
			.map((p) => p.trim())
			.filter(Boolean);
		for (const prop of props.slice(0, 3)) {
			const binaryData = executionFn.helpers.assertBinaryData(itemIndex, prop);
			const buffer = await executionFn.helpers.getBinaryDataBuffer(itemIndex, prop);
			if (buffer) {
				content.push({
					type: 'audio_url',
					audio_url: {
						url: dataUrl(buffer, binaryData.mimeType, 'audio/mpeg'),
						role: 'reference_audio',
					},
				});
			}
		}
	}

	return Promise.resolve(content);
}

export class VolcengineArkNextVideoModel implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Volcengine Ark Video Model (Next)',
		name: 'volcengineArkNextVideoModel',
		icon: 'file:volcengine.svg',
		group: ['transform'],
		version: [1],
		description:
			'Volcengine Ark (火山方舟) Seedance video generation. Supports text-to-video, first-frame-to-video, first-last-frame-to-video, and multi-modal reference (images/video/audio).',
		defaults: {
			name: 'Volcengine Ark Video Model (Next)',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Video'],
			},
			resources: {
				primaryDocumentation: [{ url: 'https://www.volcengine.com/docs/82379/1520757' }],
			},
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'volcengineArkNextApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Model',
				name: 'model',
				type: 'options',
				description:
					'Model ID from your Volcengine Ark <a href="https://www.volcengine.com/docs/82379/1520757" target="_blank" rel="noopener noreferrer">Seedance OpenAI-compatible API</a>. Options are loaded from GET /models when available; otherwise static fallbacks apply.',
				typeOptions: {
					loadOptionsMethod: 'getModels',
					allowCustomValues: true,
				},
				default: 'doubao-seedance-2-0',
			},
			{
				displayName: 'Video Mode',
				name: 'videoMode',
				type: 'options',
				default: 'text-to-video',
				description:
					'Select the video generation mode. First-Frame and First+Last Frame pass images as the start/end keyframes. Multi-Modal Reference combines reference images, videos, and audio. These modes are mutually exclusive.',
				options: [
					{
						name: 'Text to Video',
						value: 'text-to-video',
						description: 'Generate video from text prompt only.',
					},
					{
						name: 'First Frame to Video',
						value: 'first-frame-to-video',
						description: 'Use one image as the first frame of the video.',
					},
					{
						name: 'First + Last Frame to Video',
						value: 'first-last-frame-to-video',
						description: 'Use two images as the first and last frames.',
					},
					{
						name: 'Multi-Modal Reference (Images / Video / Audio)',
						value: 'multi-modal-reference',
						description:
							'Combine reference images (0-9), reference videos (0-3), and reference audio (0-3) with optional text. Seedance 2.0 only.',
					},
				],
			},
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				description:
					'Text description of the video to generate. Supports Chinese and English. For multi-modal reference, this is optional (may be omitted when providing visual/audio references).',
			},
			// --- First-Frame / First-Last-Frame: Image Input ---
			{
				displayName: 'Reference Image',
				name: 'imageInputMode',
				type: 'options',
				default: 'url',
				description: 'Provide a reference image for the first frame (or first+last frames).',
				displayOptions: {
					show: {
						videoMode: ['first-frame-to-video', 'first-last-frame-to-video'],
					},
				},
				options: [
					{
						name: 'Image URL',
						value: 'url',
						description: 'Pass a publicly accessible image URL.',
					},
					{
						name: 'Binary Data',
						value: 'binary',
						description: 'Read image from a binary property of the input item.',
					},
				],
			},
			{
				displayName: 'First Frame Image URL',
				name: 'referenceImageUrl',
				type: 'string',
				default: '',
				description: 'Publicly accessible URL of the first frame image.',
				displayOptions: {
					show: {
						videoMode: ['first-frame-to-video', 'first-last-frame-to-video'],
						imageInputMode: ['url'],
					},
				},
			},
			{
				displayName: 'First Frame Binary Property Name',
				name: 'referenceImageBinaryProperty',
				type: 'string',
				default: 'image',
				description: 'Name of the binary property containing the first frame image.',
				displayOptions: {
					show: {
						videoMode: ['first-frame-to-video', 'first-last-frame-to-video'],
						imageInputMode: ['binary'],
					},
				},
			},
			{
				displayName: 'Last Frame Image URL',
				name: 'lastFrameUrl',
				type: 'string',
				default: '',
				description: 'Publicly accessible URL of the last frame image (for first+last-frame mode).',
				displayOptions: {
					show: {
						videoMode: ['first-last-frame-to-video'],
						imageInputMode: ['url'],
					},
				},
			},
			{
				displayName: 'Last Frame Binary Property Name',
				name: 'lastFrameBinaryProperty',
				type: 'string',
				default: '',
				description: 'Name of the binary property containing the last frame image. Leave empty for single-frame mode.',
				displayOptions: {
					show: {
						videoMode: ['first-last-frame-to-video'],
						imageInputMode: ['binary'],
					},
				},
			},
			// --- Multi-Modal Reference: Inputs ---
			{
				displayName: 'Reference Images',
				name: 'refImageSourceType',
				type: 'options',
				default: 'none',
				description: 'Add reference images (0-9) for multi-modal reference video generation.',
				displayOptions: {
					show: {
						videoMode: ['multi-modal-reference'],
					},
				},
				options: [
					{ name: 'None', value: 'none' },
					{ name: 'Image URLs (one per line)', value: 'url' },
					{
						name: 'Binary Properties (comma-separated)',
						value: 'binary',
					},
				],
			},
			{
				displayName: 'Reference Image URLs',
				name: 'refImageUrls',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				description:
					'One URL per line. Up to 9 reference images. Images act as visual references, not strict keyframes.',
				displayOptions: {
					show: {
						videoMode: ['multi-modal-reference'],
						refImageSourceType: ['url'],
					},
				},
			},
			{
				displayName: 'Reference Image Binary Property Names',
				name: 'refImageBinaryProperties',
				type: 'string',
				default: 'image',
				description: 'Comma-separated binary property names from the input item. Up to 9 reference images.',
				displayOptions: {
					show: {
						videoMode: ['multi-modal-reference'],
						refImageSourceType: ['binary'],
					},
				},
			},
			{
				displayName: 'Reference Videos',
				name: 'refVideoSourceType',
				type: 'options',
				default: 'none',
				description: 'Add reference videos (0-3) for multi-modal reference video generation. Seedance 2.0 only.',
				displayOptions: {
					show: {
						videoMode: ['multi-modal-reference'],
					},
				},
				options: [
					{ name: 'None', value: 'none' },
					{ name: 'Video URLs (one per line)', value: 'url' },
					{
						name: 'Binary Properties (comma-separated)',
						value: 'binary',
					},
				],
			},
			{
				displayName: 'Reference Video URLs',
				name: 'refVideoUrls',
				type: 'string',
				typeOptions: {
					rows: 3,
				},
				default: '',
				description:
					'One URL per line. Up to 3 reference videos. Format: mp4/mov, 2-15s each, ≤50MB, ≤720p, total ≤15s.',
				displayOptions: {
					show: {
						videoMode: ['multi-modal-reference'],
						refVideoSourceType: ['url'],
					},
				},
			},
			{
				displayName: 'Reference Video Binary Property Names',
				name: 'refVideoBinaryProperties',
				type: 'string',
				default: '',
				description: 'Comma-separated binary property names from the input item. Up to 3 reference videos.',
				displayOptions: {
					show: {
						videoMode: ['multi-modal-reference'],
						refVideoSourceType: ['binary'],
					},
				},
			},
			{
				displayName: 'Reference Audio',
				name: 'refAudioSourceType',
				type: 'options',
				default: 'none',
				description:
					'Add reference audio (0-3) for multi-modal reference video generation. Seedance 2.0 only. Requires at least one reference image or video.',
				displayOptions: {
					show: {
						videoMode: ['multi-modal-reference'],
					},
				},
				options: [
					{ name: 'None', value: 'none' },
					{ name: 'Audio URLs (one per line)', value: 'url' },
					{
						name: 'Binary Properties (comma-separated)',
						value: 'binary',
					},
				],
			},
			{
				displayName: 'Reference Audio URLs',
				name: 'refAudioUrls',
				type: 'string',
				typeOptions: {
					rows: 3,
				},
				default: '',
				description: 'One URL per line. Up to 3 reference audio clips. Format: wav/mp3, 2-15s each, ≤15MB, total ≤15s.',
				displayOptions: {
					show: {
						videoMode: ['multi-modal-reference'],
						refAudioSourceType: ['url'],
					},
				},
			},
			{
				displayName: 'Reference Audio Binary Property Names',
				name: 'refAudioBinaryProperties',
				type: 'string',
				default: '',
				description: 'Comma-separated binary property names from the input item. Up to 3 reference audio clips.',
				displayOptions: {
					show: {
						videoMode: ['multi-modal-reference'],
						refAudioSourceType: ['binary'],
					},
				},
			},
			{
				displayName: 'Options',
				name: 'options',
				placeholder: 'Add Option',
				type: 'collection',
				default: {},
				options: [
					{
						displayName: 'Aspect Ratio',
						name: 'ratio',
						type: 'options',
						default: '16:9',
						description: 'Aspect ratio of the output video. Adaptive auto-chooses based on input.',
						options: [
							{ name: '16:9', value: '16:9' },
							{ name: '4:3', value: '4:3' },
							{ name: '1:1', value: '1:1' },
							{ name: '3:4', value: '3:4' },
							{ name: '9:16', value: '9:16' },
							{ name: '21:9', value: '21:9' },
							{ name: 'Adaptive', value: 'adaptive' },
						],
					},
					{
						displayName: 'Resolution',
						name: 'resolution',
						type: 'options',
						default: '720p',
						description: 'Video resolution. 1080p may not be available on all models.',
						options: [
							{ name: '480p', value: '480p' },
							{ name: '720p', value: '720p' },
							{ name: '1080p', value: '1080p' },
						],
					},
					{
						displayName: 'Duration (seconds)',
						name: 'duration',
						type: 'number',
						default: 0,
						typeOptions: {
							minValue: 0,
							maxValue: 15,
						},
						description: 'Video duration in seconds (max 15 for Seedance 2.0). 0 or empty uses the model default.',
					},
					{
						displayName: 'Add Watermark',
						name: 'watermark',
						type: 'boolean',
						default: true,
						description: 'Whether to add a watermark to the output video.',
					},
					{
						displayName: 'Generate Audio Track',
						name: 'generateAudio',
						type: 'boolean',
						default: true,
						description:
							'Whether to generate an audio track for the video. Disable when you want the original reference audio only.',
					},
					{
						displayName: 'Polling Interval (ms)',
						name: 'pollingInterval',
						type: 'number',
						typeOptions: {
							minValue: 1000,
						},
						default: 5000,
						description: 'Interval in milliseconds between status polling requests.',
					},
					{
						displayName: 'Timeout (ms)',
						name: 'timeout',
						type: 'number',
						typeOptions: {
							minValue: 10000,
						},
						default: 600000,
						description: 'Maximum time in milliseconds to wait for video generation to complete.',
					},
					{
						displayName: 'Output Property Name',
						name: 'outputPropertyName',
						type: 'string',
						default: 'video',
						description: 'Name of the binary property to set on the output item.',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			getModels,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const credentials = await this.getCredentials('volcengineArkNextApi');
		const apiKey = credentials.apiKey as string;
		const baseUrl = normalizeBaseUrl((credentials.baseUrl as string) || 'https://ark.cn-beijing.volces.com/api/v3');

		const items = this.getInputData();
		const results: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const model = this.getNodeParameter('model', itemIndex) as string;
				const videoMode = this.getNodeParameter('videoMode', itemIndex, 'text-to-video') as string;
				const prompt = this.getNodeParameter('prompt', itemIndex, '') as string;

				const options = this.getNodeParameter('options', itemIndex, {}) as {
					ratio?: string;
					resolution?: string;
					duration?: number;
					watermark?: boolean;
					generateAudio?: boolean;
					pollingInterval?: number;
					timeout?: number;
					outputPropertyName?: string;
				};

				const ratio = options.ratio ?? '16:9';
				const resolution = options.resolution ?? '720p';
				const watermark = options.watermark ?? true;
				const generateAudio = options.generateAudio ?? true;
				const duration = options.duration ?? 0;
				const pollingInterval = options.pollingInterval ?? 5000;
				const pollTimeout = options.timeout ?? 600000;
				const outputPropertyName = options.outputPropertyName ?? 'video';

				// Build the content array based on video mode
				const content: unknown[] = [];

				if (videoMode === 'text-to-video') {
					if (!prompt) {
						throw new NodeOperationError(this.getNode(), 'Prompt is required for text-to-video mode.', { itemIndex });
					}
					content.push({ type: 'text', text: prompt });
				} else if (videoMode === 'first-frame-to-video') {
					if (!prompt) {
						throw new NodeOperationError(this.getNode(), 'Prompt is required for first-frame-to-video mode.', {
							itemIndex,
						});
					}
					content.push({ type: 'text', text: prompt });

					const imageInputMode = this.getNodeParameter('imageInputMode', itemIndex, 'noImage') as string;

					if (imageInputMode === 'url') {
						const refUrl = this.getNodeParameter('referenceImageUrl', itemIndex, '') as string;
						if (refUrl) {
							content.push({
								type: 'image_url',
								image_url: { url: refUrl },
								role: 'first_frame',
							});
						}
					} else if (imageInputMode === 'binary') {
						const binaryProp = this.getNodeParameter('referenceImageBinaryProperty', itemIndex, 'image') as string;
						const binaryData = this.helpers.assertBinaryData(itemIndex, binaryProp);
						const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryProp);
						if (buffer) {
							content.push({
								type: 'image_url',
								image_url: {
									url: dataUrl(buffer, binaryData.mimeType, 'image/jpeg'),
								},
								role: 'first_frame',
							});
						}
					}
					if (!content.some((part) => (part as { role?: string }).role === 'first_frame')) {
						throw new NodeOperationError(this.getNode(), 'A first-frame image is required for this mode.', {
							itemIndex,
						});
					}
				} else if (videoMode === 'first-last-frame-to-video') {
					if (!prompt) {
						throw new NodeOperationError(this.getNode(), 'Prompt is required for first-last-frame-to-video mode.', {
							itemIndex,
						});
					}
					content.push({ type: 'text', text: prompt });

					const imageInputMode = this.getNodeParameter('imageInputMode', itemIndex, 'noImage') as string;

					// First frame
					let firstFrameUrl: string | undefined;
					if (imageInputMode === 'url') {
						firstFrameUrl = this.getNodeParameter('referenceImageUrl', itemIndex, '') as string;
					} else if (imageInputMode === 'binary') {
						const binaryProp = this.getNodeParameter('referenceImageBinaryProperty', itemIndex, 'image') as string;
						const binaryData = this.helpers.assertBinaryData(itemIndex, binaryProp);
						const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryProp);
						if (buffer) {
							firstFrameUrl = dataUrl(buffer, binaryData.mimeType, 'image/jpeg');
						}
					}
					if (firstFrameUrl) {
						content.push({
							type: 'image_url',
							image_url: { url: firstFrameUrl },
							role: 'first_frame',
						});
					}

					// Last frame
					let lastFrameUrl: string | undefined;
					if (imageInputMode === 'url') {
						lastFrameUrl = this.getNodeParameter('lastFrameUrl', itemIndex, '') as string;
					} else if (imageInputMode === 'binary') {
						const lastProp = this.getNodeParameter('lastFrameBinaryProperty', itemIndex, '') as string;
						if (lastProp) {
							const binaryData = this.helpers.assertBinaryData(itemIndex, lastProp);
							const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, lastProp);
							if (buffer) {
								lastFrameUrl = dataUrl(buffer, binaryData.mimeType, 'image/jpeg');
							}
						}
					}
					if (lastFrameUrl) {
						content.push({
							type: 'image_url',
							image_url: { url: lastFrameUrl },
							role: 'last_frame',
						});
					}
					if (!firstFrameUrl || !lastFrameUrl) {
						throw new NodeOperationError(
							this.getNode(),
							'Both first-frame and last-frame images are required for this mode.',
							{ itemIndex },
						);
					}
				} else if (videoMode === 'multi-modal-reference') {
					// Delegate content building to helper function
					const refContent = await buildMultiModalContent(this, itemIndex);
					content.push(...refContent);
					const hasVisualReference = content.some((part) => {
						const type = (part as { type?: string }).type;
						return type === 'image_url' || type === 'video_url';
					});
					const hasAudioReference = content.some((part) => (part as { type?: string }).type === 'audio_url');
					if (hasAudioReference && !hasVisualReference) {
						throw new NodeOperationError(
							this.getNode(),
							'Reference audio requires at least one reference image or video.',
							{ itemIndex },
						);
					}
				}

				if (content.length === 0) {
					throw new NodeOperationError(this.getNode(), 'At least a prompt or reference media is required.', {
						itemIndex,
					});
				}

				// Build request body
				const body: Record<string, unknown> = {
					model,
					content,
					ratio,
					resolution,
					watermark,
					generate_audio: generateAudio,
				};
				if (duration > 0) {
					body.duration = duration;
				}

				// Step 1: Create generation task
				const createResponse = (await this.helpers.httpRequest({
					method: 'POST',
					url: `${baseUrl}/contents/generations/tasks`,
					headers: {
						Authorization: `Bearer ${apiKey}`,
						'Content-Type': 'application/json',
					},
					body,
					json: true,
				})) as { id?: string };

				const taskId = createResponse?.id;
				if (!taskId) {
					throw new NodeOperationError(
						this.getNode(),
						'No task ID returned from API when creating video generation task',
						{ itemIndex },
					);
				}

				// Step 2: Poll for completion
				const startTime = Date.now();
				let lastResponse: Record<string, unknown> | null = null;
				let succeeded = false;

				while (true) {
					const elapsed = Date.now() - startTime;
					if (elapsed > pollTimeout) {
						throw new NodeOperationError(
							this.getNode(),
							`Video generation timed out after ${pollTimeout}ms (task: ${taskId}). ` +
								`You can query the task status later via GET ${baseUrl}/contents/generations/tasks/${taskId}`,
							{ itemIndex },
						);
					}

					await sleep(pollingInterval);

					const pollResponse = (await this.helpers.httpRequest({
						method: 'GET',
						url: `${baseUrl}/contents/generations/tasks/${taskId}`,
						headers: {
							Authorization: `Bearer ${apiKey}`,
							'Content-Type': 'application/json',
						},
						json: true,
					})) as Record<string, unknown>;

					lastResponse = pollResponse;
					const status = pollResponse?.status as string | undefined;

					if (status === 'succeeded') {
						succeeded = true;
						break;
					}
					if (status === 'failed') {
						const errorMsg = (pollResponse?.error as string) || JSON.stringify(pollResponse?.error);
						throw new NodeOperationError(
							this.getNode(),
							`Video generation failed: ${errorMsg || 'Unknown error'} (task: ${taskId})`,
							{ itemIndex },
						);
					}
					if (status === 'cancelled') {
						throw new NodeOperationError(this.getNode(), `Video generation was cancelled (task: ${taskId})`, {
							itemIndex,
						});
					}
					// queued / running → continue polling
				}

				if (!succeeded || !lastResponse) {
					throw new NodeOperationError(
						this.getNode(),
						`Video generation did not complete successfully (task: ${taskId})`,
						{ itemIndex },
					);
				}

				// Step 3: Extract video URL from completed response
				const contentResult = lastResponse?.content as Record<string, unknown> | undefined;
				const videoUrl = contentResult?.video_url as string | undefined;

				if (!videoUrl) {
					throw new NodeOperationError(
						this.getNode(),
						`No video URL in completed task response: ${JSON.stringify(lastResponse)}`,
						{ itemIndex },
					);
				}

				// Step 4: Download the video
				let buffer: Buffer;
				try {
					const raw = await this.helpers.httpRequest({
						method: 'GET',
						url: videoUrl,
						encoding: 'arraybuffer',
						json: false,
					});

					if (Buffer.isBuffer(raw)) {
						buffer = raw;
					} else if (typeof raw === 'string') {
						buffer = Buffer.from(raw);
					} else if (raw && typeof raw === 'object' && Buffer.isBuffer((raw as Record<string, unknown>).data)) {
						buffer = (raw as { data: Buffer }).data;
					} else {
						buffer = Buffer.from(String(raw));
					}
				} catch (downloadError) {
					results.push({
						json: {
							taskId,
							videoUrl,
							status: 'succeeded',
							downloadFailed: true,
						} as IDataObject,
					});
					continue;
				}

				const binaryData = await this.helpers.prepareBinaryData(
					buffer,
					`generated_video_${itemIndex}.mp4`,
					'video/mp4',
				);

				results.push({
					json: {
						taskId,
						videoUrl,
						status: 'succeeded',
					} as IDataObject,
					binary: {
						[outputPropertyName]: binaryData,
					},
				});
			} catch (error) {
				if (error instanceof NodeOperationError) throw error;
				throw new NodeOperationError(this.getNode(), error as Error, {
					itemIndex,
				});
			}
		}

		return [results];
	}
}
