#!/bin/bash

# ComChat GitHub Setup Script
echo "🚀 ComChat GitHub連携スクリプト"

# ユーザー名を取得
echo "GitHubユーザー名を入力してください:"
read github_username

if [ -z "$github_username" ]; then
    echo "❌ ユーザー名が入力されていません"
    exit 1
fi

echo "📁 現在のディレクトリ: $(pwd)"

# リモートリポジトリを追加
echo "🔗 リモートリポジトリを追加中..."
git remote add origin https://github.com/$github_username/comchat.git

# ブランチ名をmainに設定
echo "🌿 メインブランチを設定中..."
git branch -M main

# プッシュ
echo "⬆️ GitHubにプッシュ中..."
git push -u origin main

echo "✅ GitHub連携完了！"
echo "🌐 GitHubリポジトリ: https://github.com/$github_username/comchat"
echo "📄 GitHub Pages設定: https://github.com/$github_username/comchat/settings/pages"
echo ""
echo "次の手順:"
echo "1. 上記のGitHub Pages設定リンクにアクセス"
echo "2. Source: 'Deploy from a branch' を選択"
echo "3. Branch: 'main' を選択"
echo "4. 'Save' をクリック"
echo "5. 数分後に https://$github_username.github.io/comchat/ でアクセス可能"