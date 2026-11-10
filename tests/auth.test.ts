import { describe, expect, it } from 'vitest'
import { isEmail, normalizeServer, toAccount } from '../src/shared/auth'

describe('account server address', () => {
  it('accepts HTTPS anywhere and plain HTTP only on this computer', () => {
    expect(normalizeServer('api.example.com/')).toBe('https://api.example.com')
    expect(normalizeServer('https://api.example.com/v1/')).toBe('https://api.example.com/v1')
    expect(normalizeServer('http://localhost:8787')).toBe('http://localhost:8787')
    expect(normalizeServer('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787')
    expect(normalizeServer('http://api.example.com')).toBeNull()
    expect(normalizeServer('ftp://x.com')).toBeNull()
    expect(normalizeServer('')).toBeNull()
  })
})

describe('account data', () => {
  it('checks emails', () => {
    expect(isEmail(' mali@example.com ')).toBe(true)
    expect(isEmail('mali@')).toBe(false)
  })

  it('keeps only expected account fields and safe avatar links', () => {
    expect(toAccount({ id: '1', email: 'mali@example.com', name: '  ', isAdmin: true })).toEqual({
      id: '1',
      email: 'mali@example.com',
      name: 'mali',
      avatarUrl: undefined
    })
    expect(toAccount({ id: '1', email: 'a@b.co', avatarUrl: 'http://x/a.png' })?.avatarUrl).toBeUndefined()
    expect(toAccount({ id: '1', email: 'a@b.co', avatarUrl: 'https://x/a.png' })?.avatarUrl).toBe('https://x/a.png')
    expect(toAccount({ email: 'a@b.co' })).toBeNull()
  })
})
