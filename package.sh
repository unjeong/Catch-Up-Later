#!/bin/bash

# 크롬 웹 스토어 배포용 ZIP 파일 생성 스크립트

echo "📦 배포 패키지 생성 중..."

# 배포 폴더명
DIST_NAME="new-post-alert-extension"
ZIP_NAME="new-post-alert-extension.zip"

# 기존 zip 파일 삭제
rm -f $ZIP_NAME

# 필요한 파일만 zip으로 압축
zip -r $ZIP_NAME \
  manifest.json \
  popup.html \
  popup.js \
  styles.css \
  background.js \
  content.js \
  icons/ \
  -x "*.DS_Store" \
  -x "*.md" \
  -x "*.sh" \
  -x "generate-icons.html"

echo "✅ 완료: $ZIP_NAME 생성됨"
echo ""
echo "📋 다음 단계:"
echo "1. https://chrome.google.com/webstore/devconsole 접속"
echo "2. 새 항목 추가"
echo "3. $ZIP_NAME 업로드"
echo "4. 스토어 등록 정보 작성"
echo "5. 심사 제출"

