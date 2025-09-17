export interface RerankRequest {
  model: string;
  query: string;
  documents: string[];
  top_n?: number;
  max_chunks_per_doc?: number;
}

export interface RerankResult {
  index: number;
  relevance_score: number;
}

export interface RerankResponse {
  results: RerankResult[];
  meta?: {
    api_version?: string;
    billed_units?: {
      search_units?: number;
    };
  };
}

export interface RerankClientConfig {
  baseUrl?: string;
  apiKey: string;
  defaultModel?: string;
}

export class RerankClient {
  private baseUrl: string;
  private apiKey: string;
  private defaultModel: string;

  constructor(config: RerankClientConfig) {
    this.baseUrl = config.baseUrl || 'http://localhost:3002';
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel || 'cohere.rerank-v3-5';
  }

  async rerank(
    params: Omit<RerankRequest, 'model'> & { model?: string },
  ): Promise<RerankResponse> {
    const model = params.model || this.defaultModel;

    const requestBody: RerankRequest = {
      model,
      query: params.query,
      documents: params.documents,
      ...(params.top_n !== undefined && { top_n: params.top_n }),
      ...(params.max_chunks_per_doc !== undefined && {
        max_chunks_per_doc: params.max_chunks_per_doc,
      }),
    };

    const response = await fetch(`${this.baseUrl}/rerank`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new RerankError(
        `Rerank request failed: ${response.status} ${response.statusText}`,
        response.status,
        errorText,
      );
    }

    const data = await response.json();
    return data as RerankResponse;
  }
}

export class RerankError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public responseBody: string,
  ) {
    super(message);
    this.name = 'RerankError';
  }
}
