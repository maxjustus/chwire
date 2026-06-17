.PHONY: build test test-tcp fuzz bench bench-formats bench-concurrent bench-profile profile-escape profile-complex profile-variant profile-dynamic profile-json profile-json-caching publish update-settings

build:
	npm run build

# Full suite across ClickHouse versions (CH_VERSIONS to customize).
# For a single quick run use `npm test` (or CH_VERSION=26.4 npm test).
test: build
	npm run test:matrix

test-tcp: build
	npm run test:tcp

fuzz: build
	npm run test:fuzz

format:
	npm run format

bench:
	npm run bench

bench-formats:
	node --experimental-strip-types bench/formats.ts

# Profile with CPU sampling: make bench-profile ARGS="-f native -o encode -d complex"
# Run ./scripts/profile.ts -h for options
ARGS ?=

bench-profile:
	@rm -f bench.cpuprofile
	@node --experimental-strip-types --cpu-prof --cpu-prof-name=bench.cpuprofile scripts/profile.ts $(ARGS)
	@node --experimental-strip-types scripts/profile-hotspots.ts bench.cpuprofile
	@rm -f bench.cpuprofile

profile-escape:
	$(MAKE) bench-profile ARGS="-f native -o encode -d escape"

profile-complex:
	$(MAKE) bench-profile ARGS="-f native -o encode -d bench-complex"

profile-variant:
	$(MAKE) bench-profile ARGS="-f native -o encode -d variant"

profile-dynamic:
	$(MAKE) bench-profile ARGS="-f native -o encode -d dynamic"

profile-json:
	$(MAKE) bench-profile ARGS="-f native -o encode -d json"

bench-concurrent:
	node --experimental-strip-types bench/concurrent.ts

profile-json-caching:
	node --experimental-strip-types bench/profile-json.ts

publish:
	npm publish --access=public

# Update ClickHouse settings types from official source
# Re-run periodically to pick up new ClickHouse releases
update-settings:
	node --experimental-strip-types scripts/generate-settings-types.ts
