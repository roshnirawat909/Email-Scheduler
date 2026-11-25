export interface AuthContext {
  user: {
    id: string
    email: string
    name: string
    avatarUrl: string | null
  }
  workspace: {
    id: string
    name: string
    slug: string
  }
  role: 'ADMIN' | 'MEMBER'
}
