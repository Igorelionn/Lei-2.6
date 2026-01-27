// 🔒 SEGURANÇA: Validação robusta de arquivos antes do upload

/**
 * Configurações de validação de arquivos
 */
const FILE_VALIDATION_CONFIG = {
  // Extensões permitidas
  allowedExtensions: {
    images: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    documents: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'],
  },
  
  // MIME types permitidos
  allowedMimeTypes: {
    images: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
    ],
    documents: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
    ],
  },
  
  // Tamanhos máximos (em bytes)
  maxSizes: {
    image: 10 * 1024 * 1024, // 10MB
    document: 20 * 1024 * 1024, // 20MB
  },
  
  // Magic bytes para validação de tipo real
  magicBytes: {
    jpeg: [0xFF, 0xD8, 0xFF],
    png: [0x89, 0x50, 0x4E, 0x47],
    gif: [0x47, 0x49, 0x46],
    pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  }
};

/**
 * Erro de validação de arquivo
 */
export class FileValidationError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'FileValidationError';
  }
}

/**
 * 🔒 Valida extensão do arquivo
 */
function validateExtension(filename: string, type: 'image' | 'document'): void {
  const extension = filename.split('.').pop()?.toLowerCase();
  
  if (!extension) {
    throw new FileValidationError('Arquivo sem extensão', 'NO_EXTENSION');
  }
  
  const allowedExts = type === 'image' 
    ? FILE_VALIDATION_CONFIG.allowedExtensions.images
    : [
        ...FILE_VALIDATION_CONFIG.allowedExtensions.images,
        ...FILE_VALIDATION_CONFIG.allowedExtensions.documents
      ];
  
  if (!allowedExts.includes(extension)) {
    throw new FileValidationError(
      `Extensão .${extension} não permitida. Permitidas: ${allowedExts.join(', ')}`,
      'INVALID_EXTENSION'
    );
  }
}

/**
 * 🔒 Valida MIME type
 */
function validateMimeType(file: File, type: 'image' | 'document'): void {
  const allowedMimes = type === 'image'
    ? FILE_VALIDATION_CONFIG.allowedMimeTypes.images
    : [
        ...FILE_VALIDATION_CONFIG.allowedMimeTypes.images,
        ...FILE_VALIDATION_CONFIG.allowedMimeTypes.documents
      ];
  
  if (!allowedMimes.includes(file.type)) {
    throw new FileValidationError(
      `Tipo MIME ${file.type} não permitido`,
      'INVALID_MIME_TYPE'
    );
  }
}

/**
 * 🔒 Valida tamanho do arquivo
 */
function validateSize(file: File, type: 'image' | 'document'): void {
  const maxSize = FILE_VALIDATION_CONFIG.maxSizes[type];
  
  if (file.size > maxSize) {
    const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(1);
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
    
    throw new FileValidationError(
      `Arquivo muito grande (${fileSizeMB}MB). Tamanho máximo: ${maxSizeMB}MB`,
      'FILE_TOO_LARGE'
    );
  }
  
  if (file.size === 0) {
    throw new FileValidationError('Arquivo está vazio', 'FILE_EMPTY');
  }
}

/**
 * 🔒 Valida magic bytes (primeiros bytes do arquivo)
 * Garante que o arquivo é realmente do tipo declarado
 */
async function validateMagicBytes(file: File): Promise<void> {
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    
    // Verificar apenas se temos bytes suficientes
    if (bytes.length < 4) {
      throw new FileValidationError('Arquivo muito pequeno ou corrompido', 'FILE_CORRUPTED');
    }
    
    // Verificar JPEG
    if (file.type === 'image/jpeg') {
      if (bytes[0] !== 0xFF || bytes[1] !== 0xD8 || bytes[2] !== 0xFF) {
        throw new FileValidationError('Arquivo não é um JPEG válido', 'INVALID_FILE_FORMAT');
      }
    }
    
    // Verificar PNG
    if (file.type === 'image/png') {
      if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4E || bytes[3] !== 0x47) {
        throw new FileValidationError('Arquivo não é um PNG válido', 'INVALID_FILE_FORMAT');
      }
    }
    
    // Verificar GIF
    if (file.type === 'image/gif') {
      if (bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) {
        throw new FileValidationError('Arquivo não é um GIF válido', 'INVALID_FILE_FORMAT');
      }
    }
    
    // Verificar PDF
    if (file.type === 'application/pdf') {
      if (bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) {
        throw new FileValidationError('Arquivo não é um PDF válido', 'INVALID_FILE_FORMAT');
      }
    }
  } catch (error) {
    if (error instanceof FileValidationError) {
      throw error;
    }
    throw new FileValidationError('Erro ao validar arquivo', 'VALIDATION_ERROR');
  }
}

/**
 * 🔒 Validação completa de arquivo de imagem
 */
export async function validateImageFile(file: File): Promise<void> {
  validateExtension(file.name, 'image');
  validateMimeType(file, 'image');
  validateSize(file, 'image');
  await validateMagicBytes(file);
}

/**
 * 🔒 Validação completa de arquivo de documento
 */
export async function validateDocumentFile(file: File): Promise<void> {
  validateExtension(file.name, 'document');
  validateMimeType(file, 'document');
  validateSize(file, 'document');
  await validateMagicBytes(file);
}

/**
 * 🔒 Validação genérica (imagem ou documento)
 */
export async function validateFile(file: File, preferredType?: 'image' | 'document'): Promise<void> {
  if (!file) {
    throw new FileValidationError('Nenhum arquivo fornecido', 'NO_FILE');
  }
  
  // Determinar tipo baseado em MIME se não especificado
  const type = preferredType || (file.type.startsWith('image/') ? 'image' : 'document');
  
  if (type === 'image') {
    await validateImageFile(file);
  } else {
    await validateDocumentFile(file);
  }
}

/**
 * 🔒 Validação de múltiplos arquivos
 */
export async function validateFiles(files: File[], type?: 'image' | 'document'): Promise<void> {
  if (!files || files.length === 0) {
    throw new FileValidationError('Nenhum arquivo fornecido', 'NO_FILES');
  }
  
  // Validar cada arquivo
  const validations = files.map(file => validateFile(file, type));
  await Promise.all(validations);
}

/**
 * 🔒 Converte arquivo para base64 de forma segura
 * Com validação prévia
 */
export async function fileToBase64Secure(file: File, type?: 'image' | 'document'): Promise<string> {
  // Validar arquivo primeiro
  await validateFile(file, type);
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    
    reader.onerror = () => {
      reject(new FileValidationError('Erro ao ler arquivo', 'READ_ERROR'));
    };
    
    reader.readAsDataURL(file);
  });
}
