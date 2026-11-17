import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, statSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// The CSR and .p12 helpers the owner runs on a Mac. Tested here with a stand-in certificate authority instead of Apple, in a throwaway HOME.
const dir = resolve(import.meta.dirname, 'signing-prep');
const hasOpenssl = spawnSync('openssl', ['version']).status === 0;
const sh = (script, args, home, input = '') =>
  spawnSync('bash', [join(dir, script), ...args], {
    env: { ...process.env, HOME: home },
    input,
    encoding: 'utf8',
  });
const run = (cwd, ...a) => spawnSync('openssl', a, { cwd, encoding: 'utf8' });
const mode = (p) => (statSync(p).mode & 0o777).toString(8);

test(
  'CSR and p12 helpers: key stays private, mismatches are refused, nothing is overwritten',
  { skip: !hasOpenssl },
  () => {
    const w = mkdtempSync(join(tmpdir(), 'sp-'));
    const home = join(w, 'home');
    const key = join(home, '.dancehall-signing', 'distribution.key');
    const csr = join(home, 'Downloads', 'DanceHallFitAI_Distribution.csr');
    assert.equal(sh('make-csr.sh', ['create'], home).status, 0);
    assert.equal(mode(join(home, '.dancehall-signing')), '700');
    assert.equal(mode(key), '600');
    assert.match(readFileSync(csr, 'utf8'), /BEGIN CERTIFICATE REQUEST/);
    assert.doesNotMatch(readFileSync(csr, 'utf8'), /PRIVATE KEY/);
    assert.notEqual(sh('make-csr.sh', ['create'], home).status, 0, 'never overwrites the key');
    assert.notEqual(sh('make-csr.sh', ['nope'], home).status, 0);

    run(
      w,
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      'ca.key',
      '-out',
      'ca.pem',
      '-subj',
      '/CN=Test CA',
      '-days',
      '30',
    );
    const issue = (k, subj, out) => {
      run(w, 'req', '-new', '-key', k, '-subj', subj, '-out', 'c.csr');
      run(
        w,
        'x509',
        '-req',
        '-in',
        'c.csr',
        '-CA',
        'ca.pem',
        '-CAkey',
        'ca.key',
        '-CAcreateserial',
        '-days',
        '30',
        '-out',
        'c.pem',
      );
      run(w, 'x509', '-in', 'c.pem', '-outform', 'DER', '-out', out);
    };
    const OK =
      '/CN=Apple Distribution: FlexApp software Inc. (9RA6G4GC6Q)/OU=9RA6G4GC6Q/O=FlexApp software Inc./C=US';
    issue(key, OK, join(w, 'good.cer'));
    issue(key, '/CN=Apple Development: X (9RA6G4GC6Q)/OU=9RA6G4GC6Q', join(w, 'dev.cer'));
    issue(key, '/CN=Apple Distribution: Other (AAAAAAAAAA)/OU=AAAAAAAAAA', join(w, 'team.cer'));
    run(w, 'genrsa', '-out', 'other.key', '2048');
    issue(join(w, 'other.key'), OK, join(w, 'wrongkey.cer'));
    const pw = 'a-long-password-1\na-long-password-1\n';
    for (const bad of ['dev.cer', 'team.cer', 'wrongkey.cer'])
      assert.notEqual(sh('make-p12.sh', [join(w, bad)], home, pw).status, 0, bad);
    assert.equal(
      existsSync(join(home, '.dancehall-signing', 'distribution.p12')),
      false,
      'nothing written on refusal',
    );
    assert.notEqual(
      sh('make-p12.sh', [join(w, 'good.cer')], home, 'short\nshort\n').status,
      0,
      'weak password',
    );
    assert.notEqual(
      sh('make-p12.sh', [join(w, 'good.cer')], home, 'a-long-password-1\nDIFFERENT-long-pw\n')
        .status,
      0,
      'mismatch',
    );
    const ok = sh('make-p12.sh', [join(w, 'good.cer')], home, pw);
    assert.equal(ok.status, 0, ok.stderr);
    const p12 = join(home, '.dancehall-signing', 'distribution.p12');
    assert.equal(mode(p12), '600');
    assert.doesNotMatch(
      ok.stdout + ok.stderr,
      /a-long-password|PRIVATE KEY/,
      'never prints the password or key',
    );
    assert.notEqual(
      sh('make-p12.sh', [join(w, 'good.cer')], home, pw).status,
      0,
      'never overwrites the p12',
    );
    const info = run(
      w,
      'pkcs12',
      '-in',
      p12,
      '-passin',
      'pass:a-long-password-1',
      '-info',
      '-noout',
    );
    assert.match(
      info.stderr + info.stdout,
      /pbeWithSHA1And3-KeyTripleDES-CBC/,
      'macOS-importable algorithms',
    );
    assert.deepEqual(readdirSync(join(home, 'Downloads')), ['DanceHallFitAI_Distribution.csr']);
  },
);
