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

const STATIC_IMAGE_MODEL_IDS = ['doubao-seedream-5-0-lite', 'doubao-seedream-4-5', 'doubao-seedream-4-0'] as const;

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
		const unique = filterModelIds([...new Set(ids)], 'image').sort((a, b) => a.localeCompare(b));
		if (unique.length === 0) {
			throw new Error('Empty /models data array');
		}
		return unique.map((name) => ({ name, value: name }));
	} catch {
		return [...STATIC_IMAGE_MODEL_IDS].map((name) => ({ name, value: name }));
	}
}

export class VolcengineArkNextImageModel implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Volcengine Ark Image Model (Next)',
		name: 'volcengineArkNextImageModel',
		icon: 'file:volcengine.svg',
		group: ['transform'],
		version: [1],
		description:
			'Volcengine Ark (火山方舟) Seedream image generation via OpenAI-compatible API. Supports text-to-image and image-to-image.',
		defaults: {
			name: 'Volcengine Ark Image Model (Next)',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Image'],
			},
			resources: {
				primaryDocumentation: [{ url: 'https://www.volcengine.com/docs/82379/1541523' }],
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
					'Model ID from your Volcengine Ark <a href="https://www.volcengine.com/docs/82379/1541523" target="_blank" rel="noopener noreferrer">Seedream OpenAI-compatible API</a>. Options are loaded from GET /models when available; otherwise static fallbacks apply.',
				typeOptions: {
					loadOptionsMethod: 'getModels',
					allowCustomValues: true,
				},
				default: 'doubao-seedream-5-0-lite',
			},
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				required: true,
				default: '',
				typeOptions: {
					rows: 4,
				},
				description: 'Text description of the image to generate. Supports Chinese and English.',
			},
			{
				displayName: 'Reference Image',
				name: 'imageInputMode',
				type: 'options',
				default: 'noImage',
				description:
					'Provide a reference image for image-to-image generation. When using binary data, the image will be base64-encoded and sent inline.',
				options: [
					{
						name: 'No Image (Text-to-Image)',
						value: 'noImage',
						description: 'Generate image from text prompt only.',
					},
					{
						name: 'Image URL',
						value: 'url',
						description: 'Pass a publicly accessible image URL.',
					},
					{
						name: 'Binary Data',
						value: 'binary',
						description: 'Read image from a binary property of the input item (e.g. from previous node output).',
					},
				],
			},
			{
				displayName: 'Reference Image URL',
				name: 'referenceImageUrl',
				type: 'string',
				default: '',
				description: 'Publicly accessible URL of the reference image.',
				displayOptions: {
					show: {
						imageInputMode: ['url'],
					},
				},
			},
			{
				displayName: 'Binary Property Name',
				name: 'referenceImageBinaryProperty',
				type: 'string',
				default: 'image',
				description: 'Name of the binary property on the input item that contains the reference image data.',
				displayOptions: {
					show: {
						imageInputMode: ['binary'],
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
						displayName: 'Size Preset',
						name: 'sizePreset',
						type: 'options',
						default: '3K',
						description: 'Image size preset. Choose Custom to specify exact pixel dimensions.',
						options: [
							{ name: '2K (~2048x2048)', value: '2K' },
							{ name: '3K (~3072x3072)', value: '3K' },
							{ name: '4K (~4096x4096)', value: '4K' },
							{ name: 'Custom', value: 'Custom' },
						],
					},
					{
						displayName: 'Custom Size',
						name: 'customSize',
						type: 'string',
						default: '',
						placeholder: 'e.g. 2048x2048',
						description:
							'Exact pixel dimensions, e.g. 2048x2048, 2560x1440, 4096x4096. Range per model: 5.0-lite/4.5 [3686400, 16777216], 4.0 [921600, 16777216].',
						displayOptions: {
							show: {
								sizePreset: ['Custom'],
							},
						},
					},
					{
						displayName: 'Output Format',
						name: 'outputFormat',
						type: 'options',
						default: 'jpeg',
						description: 'Output image format. Png is only supported by Seedream 5.0-lite; 4.5/4.0 always output jpeg.',
						options: [
							{ name: 'JPEG', value: 'jpeg' },
							{ name: 'PNG', value: 'png' },
						],
					},
					{
						displayName: 'Add Watermark',
						name: 'watermark',
						type: 'boolean',
						default: true,
						description: 'Whether to add an "AI generated" watermark to the output image.',
					},
					{
						displayName: 'Sequential Image Generation',
						name: 'sequential',
						type: 'options',
						default: 'auto',
						description:
							'Controls group image (storyboard) generation. Auto generates a set of related images; Disabled generates individual images.',
						options: [
							{ name: 'Auto', value: 'auto' },
							{ name: 'Disabled', value: 'disabled' },
						],
					},
					{
						displayName: 'Number of Images',
						name: 'n',
						type: 'number',
						default: 1,
						typeOptions: {
							minValue: 1,
							maxValue: 4,
						},
						description: 'Number of images to generate (text-to-image only, no reference image).',
					},
					{
						displayName: 'Output Property Name',
						name: 'outputPropertyName',
						type: 'string',
						default: 'image',
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
				const prompt = this.getNodeParameter('prompt', itemIndex) as string;
				const imageInputMode = this.getNodeParameter('imageInputMode', itemIndex, 'noImage') as string;

				const options = this.getNodeParameter('options', itemIndex, {}) as {
					sizePreset?: string;
					customSize?: string;
					outputFormat?: string;
					watermark?: boolean;
					sequential?: string;
					n?: number;
					outputPropertyName?: string;
				};

				const sizePreset = options.sizePreset ?? '3K';
				const outputFormat = options.outputFormat ?? 'jpeg';
				const watermark = options.watermark ?? true;
				const sequential = options.sequential ?? 'auto';
				const n = options.n ?? 1;
				const outputPropertyName = options.outputPropertyName ?? 'image';

				const body: Record<string, unknown> = {
					model,
					prompt,
				};

				// Size
				if (sizePreset === 'Custom') {
					body.size = options.customSize ?? '';
				} else {
					body.size = sizePreset;
				}

				// Output format (only for 5.0-lite)
				body.output_format = outputFormat;

				// Watermark
				if (watermark !== undefined) {
					body.watermark = watermark;
				}

				// Sequential / group image
				body.sequential_image_generation = sequential;

				// Number of images (only when no reference image)
				if (imageInputMode === 'noImage') {
					body.n = n;
				}

				// Reference image
				if (imageInputMode === 'url') {
					const refUrl = this.getNodeParameter('referenceImageUrl', itemIndex, '') as string;
					if (refUrl) {
						body.image = refUrl;
					}
				} else if (imageInputMode === 'binary') {
					const binaryProp = this.getNodeParameter('referenceImageBinaryProperty', itemIndex, 'image') as string;
					const binaryData = this.helpers.assertBinaryData(itemIndex, binaryProp);
					const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryProp);
					if (buffer) {
						body.image = dataUrl(buffer, binaryData.mimeType, 'image/jpeg');
					}
				}

				// POST to images/generations
				const response = (await this.helpers.httpRequest({
					method: 'POST',
					url: `${baseUrl}/images/generations`,
					headers: {
						Authorization: `Bearer ${apiKey}`,
						'Content-Type': 'application/json',
					},
					body,
					json: true,
				})) as { data?: Array<{ url: string; revised_prompt?: string }> };

				const imageData = response?.data;
				if (!Array.isArray(imageData) || imageData.length === 0) {
					throw new NodeOperationError(this.getNode(), 'No images returned from API', { itemIndex });
				}

				// Process each returned image
				for (let i = 0; i < imageData.length; i++) {
					const entry = imageData[i];

					let buffer: Buffer;
					try {
						const raw = await this.helpers.httpRequest({
							method: 'GET',
							url: entry.url,
							encoding: 'arraybuffer',
							json: false,
						});

						if (Buffer.isBuffer(raw)) {
							buffer = raw;
						} else if (typeof raw === 'string') {
							buffer = Buffer.from(raw);
						} else if (raw && typeof raw === 'object' && Buffer.isBuffer((raw as Record<string, unknown>).data)) {
							// Some httpRequest implementations wrap in { data, ... }
							buffer = (raw as { data: Buffer }).data;
						} else {
							buffer = Buffer.from(String(raw));
						}
					} catch {
						// If download fails, still include the URL in JSON output
						results.push({
							json: {
								url: entry.url,
								revised_prompt: entry.revised_prompt,
								downloadFailed: true,
							} as IDataObject,
						});
						continue;
					}

					const ext = outputFormat === 'png' ? 'png' : 'jpg';
					const mimeType = outputFormat === 'png' ? 'image/png' : 'image/jpeg';
					const binaryData = await this.helpers.prepareBinaryData(
						buffer,
						`generated_image_${itemIndex}_${i}.${ext}`,
						mimeType,
					);

					results.push({
						json: {
							url: entry.url,
							revised_prompt: entry.revised_prompt,
							index: i,
						} as IDataObject,
						binary: {
							[outputPropertyName]: binaryData,
						},
					});
				}
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
