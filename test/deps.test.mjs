import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractGoImports,
  extractJavaImports,
  extractJavaPackage,
  extractJsImports,
  extractPythonImports,
} from '../src/deps.mjs';

test('extracts JS/TS import forms without duplicates', () => {
  const source = `
import React from 'react';
import type { User } from '@/types/user';
import {
  alpha,
  beta,
} from './alpha';
export { thing } from './thing';
export * from './star';
const legacy = require('./legacy');
const lazy = import('./lazy');
import './side-effect';
`;
  const imports = extractJsImports(source);
  const specs = imports.map((item) => item.spec).sort();
  assert.deepEqual(specs, [
    './alpha',
    './lazy',
    './legacy',
    './side-effect',
    './star',
    './thing',
    '@/types/user',
    'react',
  ]);
});

test('extracts Python imports and relative levels', () => {
  const source = `
import os, sys as system
from app.auth import jwt, login as sign_in
from . import sibling
from ..pkg.module import (
    Alpha,
    Beta as B,
)
`;
  const imports = extractPythonImports(source);
  const absolute = imports.filter((item) => item.kind === 'py-import').map((item) => item.module);
  assert.deepEqual(absolute, ['os', 'sys']);

  const froms = imports.filter((item) => item.kind === 'py-from');
  assert.equal(froms.length, 3);
  assert.equal(froms[0].module, 'app.auth');
  assert.deepEqual(froms[0].names, ['jwt', 'login']);
  assert.equal(froms[1].level, 1);
  assert.equal(froms[1].module, '');
  assert.deepEqual(froms[1].names, ['sibling']);
  assert.equal(froms[2].level, 2);
  assert.equal(froms[2].module, 'pkg.module');
  assert.deepEqual(froms[2].names, ['Alpha', 'Beta']);
});

test('extracts Go import blocks and single imports', () => {
  const source = `package demo

import (
	"fmt"
	alias "example.com/app/internal/auth"
	_ "embed"
)

import "example.com/app/internal/config"

func main() { fmt.Println(alias.Name, config.Port) }
`;
  const imports = extractGoImports(source);
  assert.deepEqual(
    imports.map((item) => item.spec),
    ['fmt', 'example.com/app/internal/auth', 'embed', 'example.com/app/internal/config'],
  );
});

test('extracts Java package, imports and static wildcards', () => {
  const source = `package com.example.auth;

import com.example.config.AppConfig;
import static com.example.util.Checks.*;
import com.example.model.*;
import com.example.auth.JwtService.Inner;
import java.util.List;

public class JwtService {}
`;
  assert.equal(extractJavaPackage(source), 'com.example.auth');
  const imports = extractJavaImports(source);
  assert.equal(imports.length, 5);
  assert.deepEqual(
    imports.map((item) => [item.name, item.static, item.wildcard]),
    [
      ['com.example.config.AppConfig', false, false],
      ['com.example.util.Checks', true, true],
      ['com.example.model', false, true],
      ['com.example.auth.JwtService.Inner', false, false],
      ['java.util.List', false, false],
    ],
  );
});
