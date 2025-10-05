#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check for dry-run flag
DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
    DRY_RUN=true
    echo -e "${YELLOW}=== DRY RUN MODE ===${NC}"
    echo -e "${YELLOW}No changes will be committed or published${NC}"
    echo ""
fi

# Get current version from package.json
CURRENT_VERSION=$(grep -o '"version": "[^"]*"' package.json | cut -d'"' -f4)

echo -e "${BLUE}=== LetMeReShade Release Builder ===${NC}"
echo -e "${YELLOW}Current version: ${CURRENT_VERSION}${NC}"
echo ""

# In dry-run mode, default to production build with bumped patch version
if [[ "$DRY_RUN" == true ]]; then
    IS_DEV=false
    # Bump patch version from current
    IFS='.' read -r MAJOR MINOR PATCH <<< "${CURRENT_VERSION}"
    PATCH=$((PATCH + 1))
    VERSION="${MAJOR}.${MINOR}.${PATCH}"
else
    # Ask build type
    echo -e "${GREEN}Select build type:${NC}"
    echo "1) Dev build (${CURRENT_VERSION}-dev-YYYYMMDD-hash)"
    echo "2) Production release (new version number)"
    read -p "Enter choice [1-2]: " BUILD_TYPE

    if [[ "$BUILD_TYPE" == "1" ]]; then
        # Dev build
        DATE=$(date +%Y%m%d)
        SHORT_HASH=$(git rev-parse --short HEAD)
        VERSION="${CURRENT_VERSION}-dev-${DATE}-${SHORT_HASH}"
        IS_DEV=true
        echo -e "${YELLOW}Creating dev build: ${VERSION}${NC}"
    elif [[ "$BUILD_TYPE" == "2" ]]; then
        # Production build
        IS_DEV=false
        echo -e "${GREEN}Creating production release${NC}"
        read -p "Enter new version number (e.g., 1.9, 2.0): " NEW_VERSION

        if [[ -z "$NEW_VERSION" ]]; then
            echo -e "${RED}Error: Version number cannot be empty${NC}"
            exit 1
        fi

        VERSION="$NEW_VERSION"
        echo -e "${YELLOW}New version will be: ${VERSION}${NC}"

        # Update version in package.json
        echo -e "${BLUE}Updating version in package.json...${NC}"
        sed -i.bak "s/\"version\": \"${CURRENT_VERSION}\"/\"version\": \"${VERSION}\"/" package.json
        rm package.json.bak

        # Check if there are changes to commit
        if git diff --quiet package.json; then
            echo -e "${YELLOW}No version changes to commit${NC}"
        else
            echo -e "${BLUE}Committing version change...${NC}"
            git add package.json
            git commit -m "chore: bump version to ${VERSION}"
        fi
    else
        echo -e "${RED}Invalid choice. Exiting.${NC}"
        exit 1
    fi
fi

# Verify clean working directory (except for the version commit we just made)
if [[ "$IS_DEV" == false ]] && [[ "$DRY_RUN" == false ]] && ! git diff --quiet; then
    echo -e "${RED}Error: Working directory has uncommitted changes${NC}"
    echo "Please commit or stash your changes before creating a release"
    exit 1
fi

# Run linting/formatting if configured
echo -e "${BLUE}Checking for linters and formatters...${NC}"

# Check for lint script
if grep -q '"lint"' package.json; then
    echo -e "${BLUE}Running lint...${NC}"
    pnpm run lint
else
    echo -e "${YELLOW}No lint script found, skipping${NC}"
fi

# Check for prettier
if grep -q '"prettier"' package.json || [ -f ".prettierrc" ] || [ -f ".prettierrc.json" ] || [ -f ".prettierrc.js" ]; then
    if grep -q '"format"' package.json; then
        echo -e "${BLUE}Running prettier...${NC}"
        pnpm run format
    else
        echo -e "${YELLOW}Prettier configured but no format script found, skipping${NC}"
    fi
fi

# Check for test script (but skip if it's just the default "no test specified")
if grep -q '"test"' package.json && ! grep -q 'Error: no test specified' package.json; then
    echo -e "${BLUE}Running tests...${NC}"
    pnpm run test
else
    echo -e "${YELLOW}No tests configured, skipping${NC}"
fi

# Install dependencies
echo -e "${BLUE}Installing dependencies...${NC}"
pnpm install

# Build the plugin
echo -e "${BLUE}Building plugin...${NC}"
pnpm run build

# Check if dist directory exists
if [[ ! -d "dist" ]]; then
    echo -e "${RED}Error: dist directory not found. Build may have failed.${NC}"
    exit 1
fi

# Create release directory
RELEASE_DIR="LetMeReShade"
ZIP_NAME="LetMeReShade_v${VERSION}.zip"

# Check if zip already exists in dry-run mode and bump version if needed
if [[ "$DRY_RUN" == true ]]; then
    while [[ -f "${ZIP_NAME}" ]]; do
        echo -e "${YELLOW}[DRY RUN] Zip file ${ZIP_NAME} already exists, bumping patch version...${NC}"

        # Extract version parts (assuming semantic versioning like 1.8.1)
        IFS='.' read -r MAJOR MINOR PATCH <<< "${VERSION}"

        # Bump patch version
        PATCH=$((PATCH + 1))
        VERSION="${MAJOR}.${MINOR}.${PATCH}"
        ZIP_NAME="LetMeReShade_v${VERSION}.zip"

        echo -e "${YELLOW}[DRY RUN] Trying version: ${VERSION}${NC}"
    done

    if [[ "${ZIP_NAME}" != "LetMeReShade_v${MAJOR}.${MINOR}.$((PATCH - 1)).zip" ]]; then
        echo -e "${YELLOW}[DRY RUN] Final version: ${VERSION}${NC}"
        echo -e "${YELLOW}[DRY RUN] Final zip name: ${ZIP_NAME}${NC}"
    fi

    # Temporarily update package.json version for the zip
    echo -e "${YELLOW}[DRY RUN] Temporarily updating package.json to version ${VERSION} for zip...${NC}"
    sed -i.bak "s/\"version\": \"${CURRENT_VERSION}\"/\"version\": \"${VERSION}\"/" package.json
fi

echo -e "${BLUE}Creating release package...${NC}"

# Create temporary directory structure
rm -rf "${RELEASE_DIR}" "${ZIP_NAME}"
mkdir -p "${RELEASE_DIR}"

# Copy necessary files
cp -r dist "${RELEASE_DIR}/"
cp -r defaults "${RELEASE_DIR}/"
cp main.py "${RELEASE_DIR}/"
cp package.json "${RELEASE_DIR}/"
cp plugin.json "${RELEASE_DIR}/"
cp LICENSE "${RELEASE_DIR}/"
cp README.md "${RELEASE_DIR}/"

# Restore package.json if this was a dry-run
if [[ "$DRY_RUN" == true ]] && [[ -f "package.json.bak" ]]; then
    echo -e "${YELLOW}[DRY RUN] Restoring original package.json...${NC}"
    mv package.json.bak package.json
fi

# Create zip file
echo -e "${BLUE}Creating zip file: ${ZIP_NAME}${NC}"
zip -r "${ZIP_NAME}" "${RELEASE_DIR}"

# Cleanup
rm -rf "${RELEASE_DIR}"

echo -e "${GREEN}✓ Release package created: ${ZIP_NAME}${NC}"

# For production builds, create git tag and GitHub release
if [[ "$IS_DEV" == false ]] && [[ "$DRY_RUN" == false ]]; then
    TAG_NAME="v${VERSION}"

    echo ""
    read -p "Create GitHub release (will create tag ${TAG_NAME} and push)? [y/N]: " CREATE_RELEASE

    if [[ "$CREATE_RELEASE" =~ ^[Yy]$ ]]; then
        # Check if gh CLI is available
        if ! command -v gh &> /dev/null; then
            echo -e "${RED}Error: GitHub CLI (gh) is not installed${NC}"
            echo "Please install it: https://cli.github.com/"
            echo "Or create the release manually at: https://github.com/itsOwen/LetMeReShade/releases/new"
            exit 1
        fi

        if [[ "$DRY_RUN" == true ]]; then
            echo -e "${YELLOW}[DRY RUN] Would create git tag: ${TAG_NAME}${NC}"
            echo -e "${YELLOW}[DRY RUN] Would push tag to remote${NC}"
            echo -e "${YELLOW}[DRY RUN] Would create GitHub release with:${NC}"
            echo -e "${YELLOW}  - Tag: ${TAG_NAME}${NC}"
            echo -e "${YELLOW}  - Title: LetMeReShade v${VERSION}${NC}"
            echo -e "${YELLOW}  - Asset: ${ZIP_NAME}${NC}"
            echo -e "${YELLOW}  - Repo: itsOwen/LetMeReShade${NC}"
        else
            echo -e "${BLUE}Creating git tag: ${TAG_NAME}${NC}"
            git tag -a "${TAG_NAME}" -m "Release ${VERSION}"

            echo -e "${BLUE}Pushing tag to remote...${NC}"
            git push origin "${TAG_NAME}"

            # Prompt for release notes
            echo -e "${YELLOW}Enter release notes (press Ctrl+D when done):${NC}"
            RELEASE_NOTES=$(cat)

            echo -e "${BLUE}Creating GitHub release...${NC}"
            # Create release with uploaded zip
            gh release create "${TAG_NAME}" \
                "${ZIP_NAME}" \
                --title "LetMeReShade v${VERSION}" \
                --notes "${RELEASE_NOTES}" \
                --repo itsOwen/LetMeReShade

            echo -e "${GREEN}✓ GitHub release created successfully!${NC}"
            echo -e "${BLUE}View at: https://github.com/itsOwen/LetMeReShade/releases/tag/${TAG_NAME}${NC}"
        fi
    fi
else
    echo -e "${YELLOW}Dev build complete. Skipping git tag and GitHub release.${NC}"
fi

echo ""
echo -e "${GREEN}=== Build Complete ===${NC}"
if [[ "$DRY_RUN" == true ]]; then
    echo -e "${YELLOW}DRY RUN - No changes were published${NC}"
fi
echo -e "Release file: ${BLUE}${ZIP_NAME}${NC}"
echo -e "Version: ${BLUE}${VERSION}${NC}"
