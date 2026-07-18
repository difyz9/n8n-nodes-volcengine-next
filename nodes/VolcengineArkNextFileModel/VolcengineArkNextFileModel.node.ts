import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';
import { FormData } from 'undici';

function normalizeBaseUrl(url: string): string {
	return String(url).trim().replace(/\/+$/, '');
}

export class VolcengineArkNextFileModel implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Volcengine Ark File (Next)',
		name: 'volcengineArkNextFileModel',
		icon: 'file:volcengine.svg',
		group: ['transform'],
		version: [1],
		description:
			'Volcengine Ark (火山方舟) Files API. Upload, list, retrieve, and delete files for use with multi-modal models.',
		defaults: {
			name: 'Volcengine Ark File (Next)',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['File'],
			},
			resources: {
				primaryDocumentation: [{ url: 'https://www.volcengine.com/docs/82379/1885708' }],
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
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'upload',
				description: 'File operation to perform.',
				options: [
					{
						name: 'Upload',
						value: 'upload',
						description:
							'Upload a file from binary data. Supports up to 512 MB. Returns a file_id usable in multi-modal model requests.',
					},
					{
						name: 'List',
						value: 'list',
						description: 'List all uploaded files. Optionally filter by purpose.',
					},
					{
						name: 'Get Info',
						value: 'get',
						description: 'Retrieve file metadata by file_id.',
					},
					{
						name: 'Download Content',
						value: 'getContent',
						description: 'Download the content of a file by file_id as binary data.',
					},
					{
						name: 'Delete',
						value: 'delete',
						description: 'Delete a file by file_id. The file must not be in processing status.',
					},
				],
			},
			// --- Upload ---
			{
				displayName: 'Binary Property Name',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				description: 'Name of the binary property on the input item that contains the file data to upload.',
				displayOptions: {
					show: {
						operation: ['upload'],
					},
				},
			},
			{
				displayName: 'File Name',
				name: 'fileName',
				type: 'string',
				default: '',
				description:
					'File name (e.g. document.pdf, image.png). If empty, the original file name from binary data is used.',
				displayOptions: {
					show: {
						operation: ['upload'],
					},
				},
			},
			{
				displayName: 'Purpose',
				name: 'purpose',
				type: 'string',
				default: 'user_data',
				description: 'File purpose. Default is "user_data". Must match what the target model expects.',
				displayOptions: {
					show: {
						operation: ['upload'],
					},
				},
			},
			// --- List ---
			{
				displayName: 'Purpose Filter',
				name: 'listPurpose',
				type: 'string',
				default: '',
				description: 'Optional purpose filter (e.g. "user_data"). Leave empty to list all files.',
				displayOptions: {
					show: {
						operation: ['list'],
					},
				},
			},
			// --- Single-file operations ---
			{
				displayName: 'File ID',
				name: 'fileId',
				type: 'string',
				default: '',
				required: true,
				description: 'The file ID (e.g. file-20251018xxxx) returned by a previous upload or list operation.',
				displayOptions: {
					show: {
						operation: ['get', 'getContent', 'delete'],
					},
				},
			},
			{
				displayName: 'Binary Property Name (Output)',
				name: 'outputBinaryPropertyName',
				type: 'string',
				default: 'file',
				description: 'Name of the binary property to set on the output item when downloading file content.',
				displayOptions: {
					show: {
						operation: ['getContent'],
					},
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const credentials = await this.getCredentials('volcengineArkNextApi');
		const apiKey = credentials.apiKey as string;
		const baseUrl = normalizeBaseUrl((credentials.baseUrl as string) || 'https://ark.cn-beijing.volces.com/api/v3');

		const items = this.getInputData();
		const operation = this.getNodeParameter('operation', 0) as string;
		const results: INodeExecutionData[] = [];

		if (operation === 'upload') {
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				try {
					const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string;
					const purpose = this.getNodeParameter('purpose', itemIndex, 'user_data') as string;
					const customFileName = this.getNodeParameter('fileName', itemIndex, '') as string;
					const binaryData = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
					const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);

					const fileName = customFileName || binaryData.fileName || `upload_${itemIndex}.bin`;

					const form = new FormData();
					form.append('purpose', purpose);
					form.append('file', buffer, fileName);

					const response = (await this.helpers.httpRequest({
						method: 'POST',
						url: `${baseUrl}/files`,
						headers: {
							Authorization: `Bearer ${apiKey}`,
						},
						body: form,
						json: true,
					})) as Record<string, unknown>;

					results.push({
						json: response as IDataObject,
						pairedItem: { item: itemIndex },
					});
				} catch (error) {
					if (error instanceof NodeOperationError) throw error;
					throw new NodeOperationError(this.getNode(), error as Error, {
						itemIndex,
					});
				}
			}
		} else if (operation === 'list') {
			const listPurpose = this.getNodeParameter('listPurpose', 0, '') as string;

			try {
				const qs: IDataObject = {};
				if (listPurpose) {
					qs.purpose = listPurpose;
				}

				const response = (await this.helpers.httpRequest({
					method: 'GET',
					url: `${baseUrl}/files`,
					qs,
					headers: {
						Authorization: `Bearer ${apiKey}`,
						'Content-Type': 'application/json',
					},
					json: true,
				})) as { data?: Array<Record<string, unknown>> };

				const fileList = response?.data ?? [];
				if (fileList.length === 0) {
					results.push({
						json: { data: [], message: 'No files found.' } as IDataObject,
					});
				} else {
					for (const file of fileList) {
						results.push({
							json: file as IDataObject,
						});
					}
				}
			} catch (error) {
				if (error instanceof NodeOperationError) throw error;
				throw new NodeOperationError(this.getNode(), error as Error, {
					itemIndex: 0,
				});
			}
		} else if (operation === 'get') {
			const fileId = this.getNodeParameter('fileId', 0) as string;

			try {
				const response = (await this.helpers.httpRequest({
					method: 'GET',
					url: `${baseUrl}/files/${fileId}`,
					headers: {
						Authorization: `Bearer ${apiKey}`,
						'Content-Type': 'application/json',
					},
					json: true,
				})) as Record<string, unknown>;

				results.push({
					json: response as IDataObject,
				});
			} catch (error) {
				if (error instanceof NodeOperationError) throw error;
				throw new NodeOperationError(this.getNode(), error as Error, {
					itemIndex: 0,
				});
			}
		} else if (operation === 'getContent') {
			const fileId = this.getNodeParameter('fileId', 0) as string;
			const outputBinaryPropertyName = this.getNodeParameter('outputBinaryPropertyName', 0, 'file') as string;

			try {
				const raw = (await this.helpers.httpRequest({
					method: 'GET',
					url: `${baseUrl}/files/${fileId}/content`,
					headers: {
						Authorization: `Bearer ${apiKey}`,
					},
					encoding: 'arraybuffer',
					json: false,
				})) as Buffer | string | Record<string, unknown>;

				let buffer: Buffer;
				if (Buffer.isBuffer(raw)) {
					buffer = raw;
				} else if (typeof raw === 'string') {
					buffer = Buffer.from(raw);
				} else if (raw && typeof raw === 'object' && Buffer.isBuffer((raw as Record<string, unknown>).data)) {
					buffer = (raw as { data: Buffer }).data;
				} else {
					buffer = Buffer.from(String(raw));
				}

				// Also fetch metadata for the file name and mime type
				let fileName = `file_${fileId}`;
				let mimeType: string | undefined;
				try {
					const meta = (await this.helpers.httpRequest({
						method: 'GET',
						url: `${baseUrl}/files/${fileId}`,
						headers: {
							Authorization: `Bearer ${apiKey}`,
							'Content-Type': 'application/json',
						},
						json: true,
					})) as Record<string, unknown>;
					if (meta.filename) fileName = meta.filename as string;
					if (meta.mime_type) mimeType = meta.mime_type as string;
				} catch {
					// metadata fetch is best-effort
				}

				const binaryData = await this.helpers.prepareBinaryData(buffer, fileName, mimeType);

				results.push({
					json: {
						fileId,
						fileName,
					} as IDataObject,
					binary: {
						[outputBinaryPropertyName]: binaryData,
					},
				});
			} catch (error) {
				if (error instanceof NodeOperationError) throw error;
				throw new NodeOperationError(this.getNode(), error as Error, {
					itemIndex: 0,
				});
			}
		} else if (operation === 'delete') {
			const fileId = this.getNodeParameter('fileId', 0) as string;

			try {
				const response = (await this.helpers.httpRequest({
					method: 'DELETE',
					url: `${baseUrl}/files/${fileId}`,
					headers: {
						Authorization: `Bearer ${apiKey}`,
						'Content-Type': 'application/json',
					},
					json: true,
				})) as Record<string, unknown>;

				results.push({
					json: {
						fileId,
						...response,
					} as IDataObject,
				});
			} catch (error) {
				if (error instanceof NodeOperationError) throw error;
				throw new NodeOperationError(this.getNode(), error as Error, {
					itemIndex: 0,
				});
			}
		}

		return [results];
	}
}
