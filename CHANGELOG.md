# Changelog

All notable changes to Python React ML will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial framework implementation
- Core Python execution engine with Pyodide integration
- React hooks and components for web applications
- React Native bridge for mobile applications
- CLI tools for model bundling and validation
- Web Worker implementation for non-blocking Python execution
- TypeScript support across all packages
- Comprehensive documentation and examples

### Features
- `@python-react-ml/core` - Core Python execution engine
- `@python-react-ml/react` - React hooks (`useModel`, `usePythonEngine`) and components
- `@python-react-ml/react-native` - Native bridge for iOS/Android
- `@python-react-ml/cli` - CLI tools for project management

### Components
- `useModel` hook for loading and executing Python models
- `usePythonEngine` hook for engine management
- `PythonModelProvider` context provider
- `ModelLoader` component with render props pattern
- Web Worker for isolated Python execution
- Native bridge for React Native platform

### CLI Commands
- `python-react-ml init` - Initialize new projects
- `python-react-ml bundle` - Bundle Python models for deployment
- `python-react-ml validate` - Validate Python model compatibility

## [0.1.0] - 2025-09-24

### Added
- Project initialization and basic structure
- Package.json configurations for monorepo
- TypeScript configuration
- Build system setup with tsup
- Workspace management with npm workspaces

### Changed
- N/A (Initial release)

### Deprecated
- N/A

### Removed
- N/A

### Fixed
- N/A

### Security
- N/A

---

## Release Process

This project uses automated releases with [Changesets](https://github.com/changesets/changesets).

### Version Categories

- **Major** (x.0.0) - Breaking changes that require user action
- **Minor** (0.x.0) - New features, backward compatible
- **Patch** (0.0.x) - Bug fixes, backward compatible

### How to Contribute

1. Make your changes
2. Run `npx changeset` to create a changeset
3. Commit both your changes and the changeset
4. Create a pull request

The changeset will be automatically included in the next release.