export const campaignAttachmentExtensions = {
  documents: ['.pdf', '.doc', '.docx', '.txt'],
  images: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
  videos: ['.mp4', '.avi', '.mov', '.mkv', '.webm'],
  presentations: ['.ppt', '.pptx'],
  spreadsheets: ['.xls', '.xlsx', '.csv'],
  programming: [
    '.js',
    '.java',
    '.py',
    '.html',
    '.css',
    '.sql',
    '.ts',
    '.jsx',
    '.tsx',
    '.php',
    '.c',
    '.cpp',
    '.cs',
  ],
  data: ['.xml', '.json', '.yaml', '.yml'],
  compressed: ['.zip', '.rar'],
} as const

export type CampaignAttachmentField = keyof typeof campaignAttachmentExtensions

export const campaignAttachmentCategory = {
  documents: 'DOCUMENTS',
  images: 'IMAGES',
  videos: 'VIDEOS',
  presentations: 'PRESENTATIONS',
  spreadsheets: 'SPREADSHEETS',
  programming: 'PROGRAMMING',
  data: 'DATA',
  compressed: 'COMPRESSED',
} as const

export const campaignAttachmentMimeTypes: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.js': 'text/javascript',
  '.java': 'text/x-java-source',
  '.py': 'text/x-python',
  '.html': 'text/html',
  '.css': 'text/css',
  '.sql': 'application/sql',
  '.ts': 'text/typescript',
  '.jsx': 'text/jsx',
  '.tsx': 'text/tsx',
  '.php': 'application/x-httpd-php',
  '.c': 'text/x-c',
  '.cpp': 'text/x-c++',
  '.cs': 'text/plain',
  '.xml': 'application/xml',
  '.json': 'application/json',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
}

export const MAX_CAMPAIGN_ATTACHMENT_FILE_BYTES = 10 * 1024 * 1024
export const MAX_CAMPAIGN_ATTACHMENT_BYTES = 15 * 1024 * 1024
export const MAX_CAMPAIGN_ATTACHMENT_COUNT = 20
export const MAX_CAMPAIGN_FORM_BYTES = 2 * 1024 * 1024
