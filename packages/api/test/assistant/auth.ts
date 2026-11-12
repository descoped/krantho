import type { AuthenticatedUser } from '../../src/types.js'

export const viewer: AuthenticatedUser = {
  id: 'user-viewer',
  email: 'vera.viewer@example.com',
  name: 'Vera Viewer',
  roles: ['viewer'],
  mode: 'token',
}

export const editor: AuthenticatedUser = {
  id: 'user-editor',
  email: 'eddie.editor@example.com',
  name: 'Eddie Editor',
  roles: ['editor'],
  mode: 'token',
}

export const admin: AuthenticatedUser = {
  id: 'user-admin',
  email: 'ada.admin@example.com',
  name: 'Ada Admin',
  roles: ['admin'],
  mode: 'token',
}

/** Every e-mail address in the fixtures — none may reach the model */
export const EMAILS = [viewer.email, editor.email, admin.email, 'author@example.com']
