/**
 * §05.1: nobody registers themselves.
 *
 * This is the check that closes the public door while leaving the server-side
 * one open. It matters more than it looks: the config switch that used to do
 * this closed *both*, so no staff login could be created at all — including by
 * the seed script, which is how it was found.
 */

import { describe, expect, it } from 'vitest';

import { isPublicSignUpAttempt } from './public-signup';

const request = (path: string) => new Request(`https://yard.example.com${path}`);

describe('public sign-up attempts', () => {
  it('recognises the sign-up endpoints', () => {
    expect(isPublicSignUpAttempt(request('/api/auth/sign-up'))).toBe(true);
    expect(isPublicSignUpAttempt(request('/api/auth/sign-up/email'))).toBe(true);
    expect(isPublicSignUpAttempt(request('/api/auth/sign-up/email?next=/'))).toBe(true);
  });

  it('leaves sign-in and everything else alone', () => {
    expect(isPublicSignUpAttempt(request('/api/auth/sign-in/email'))).toBe(false);
    expect(isPublicSignUpAttempt(request('/api/auth/sign-out'))).toBe(false);
    expect(isPublicSignUpAttempt(request('/api/auth/get-session'))).toBe(false);
    expect(isPublicSignUpAttempt(request('/api/users'))).toBe(false);
  });

  it('is not fooled by a path that merely mentions sign-up', () => {
    // A customer named "sign-up" is absurd, but a route that greps for a
    // substring anywhere would also block /api/auth/sign-upgrade one day.
    expect(isPublicSignUpAttempt(request('/api/auth/sign-upgrade'))).toBe(false);
  });
});
