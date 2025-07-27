.PHONY: all clean

DEPS := $(wildcard packages/*/package.json)
PACKAGES := borsh sdk-core sdk-solana sdk-sui sdk-facade
ALL_TARGETS := $(foreach pkg,$(PACKAGES),packages/$(pkg)/lib)

all: $(ALL_TARGETS)

clean:
	rm -rf node_modules
	rm -rf $(ALL_TARGETS)
	@echo Build cleaned!

node_modules: $(DEPS)
	npm i -ws

define LIB_template
packages/$(1)/lib: node_modules $$(wildcard packages/$(1)/src/*.ts wildcard packages/$(1)/src/**/*.ts packages/$(1)/*.js packages/$(1)/*.json)
	@echo make: Entering directory "'packages/$(1)'"
	npm run build --workspace=@race-foundation/$(1)
	touch $$@
	@echo make: Leaving directory "'packages/$(1)'"
endef

$(foreach pkg,$(PACKAGES),$(eval $(call LIB_template,$(pkg))))
