declare global {
  const process: {
    env: Record<string, string | undefined>;
    cwd(): string;
  };

  const Buffer: {
    from(data: string | ArrayBuffer, encoding?: string): {
      toString(encoding?: string): string;
    };
  };

  const __dirname: string;
}

interface RequestInit {
  next?: {
    revalidate?: number | false;
    tags?: string[];
  };
}

export {};
