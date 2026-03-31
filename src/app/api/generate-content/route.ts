import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicClient, MODEL } from '@/lib/anthropic';
import { MEDICAL_COMPLIANCE_SYSTEM_PROMPT, checkCompliance } from '@/lib/medical-compliance';

export async function POST(req: NextRequest) {
  try {
    const { title, keyword, hospitalType, additionalInfo } = await req.json();

    if (!title || !keyword) {
      return NextResponse.json({ error: '제목과 키워드를 입력해주세요.' }, { status: 400 });
    }

    const systemPrompt = `당신은 네이버 블로그 상위노출 전문 의료 콘텐츠 작가입니다.
네이버 D.I.A+ 알고리즘과 C-Rank 기준에 최적화된 글을 작성합니다.

${MEDICAL_COMPLIANCE_SYSTEM_PROMPT}

【네이버 상위노출 콘텐츠 원칙】
- D.I.A+: 제목-본문 의도 완벽 일치 (검색자가 원하는 정보 제공)
- C-Rank: 전문성과 신뢰도 높은 의료 정보 작성
- 구조: 도입 → 원인/배경 → 증상/특징 → 치료/관리 → 예방 → 전문의 상담
- H2 소제목 4~5개, H3 소제목 2~3개로 가독성 최적화
- 각 섹션에 이미지 위치 표시 [이미지 N: 설명] 포함
- 키워드 3~6회 자연스럽게 배치 (과도 반복 금지)
- 단락당 150~250자로 스캔 가능한 구조`;

    const userPrompt = `다음 제목으로 네이버 블로그 상위노출 최적화 본문을 작성하세요.

제목: "${title}"
핵심 키워드: "${keyword}"
병원 유형: ${hospitalType || '일반 병원'}
추가 정보: ${additionalInfo || '없음'}

【필수 요구사항】
1. 1,400~1,600자 (공백 포함) — 반드시 준수
2. 의료광고법 완전 준수 (금지어 절대 금지)
3. H2(##) 소제목 4~5개 + H3(###) 소제목 2개 포함
4. 키워드 "${keyword}" 3~6회 자연스럽게 배치
5. 각 H2 섹션 뒤에 [이미지 N: 이미지 설명] 형식으로 이미지 위치 명시 (총 6개)
6. 섹션 구성 순서:
   - ## 도입 (환자 공감 + 키워드 첫 등장)
   - ## 원인과 배경
   - ## 주요 증상 (### 세부 증상 포함)
   - ## 치료 및 관리 방법 (### 세부 치료법 포함)
   - ## 예방과 생활습관
   - ## 전문의 상담이 필요한 경우
7. 마지막 문장: "개인마다 차이가 있을 수 있으므로, 반드시 전문의와 상담 후 결정하시기 바랍니다."

본문만 작성 (제목 제외).`;

    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textContent = response.content.find((b) => b.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json({ error: '본문 생성에 실패했습니다.' }, { status: 500 });
    }

    const body = textContent.text;
    const charCount = body.replace(/\[이미지\s*\d+:[^\]]*\]/g, '').length;
    const compliance = checkCompliance(body);

    // SEO 분석
    const h2Count = (body.match(/^## (?!#)/gm) || []).length;
    const h3Count = (body.match(/^### /gm) || []).length;
    const keywordCount = (body.toLowerCase().split(keyword.toLowerCase()).length - 1);
    const estimatedReadingTime = Math.ceil(charCount / 500);
    const structureScore = Math.min(100, h2Count * 15 + h3Count * 10 + (keywordCount >= 3 && keywordCount <= 6 ? 20 : 0));

    // 이미지 가이드라인
    const imageMatches = body.match(/\[이미지\s*\d+:\s*([^\]]+)\]/g) || [];
    const placementHints = imageMatches.map((m, i) => ({
      section: `이미지 ${i + 1}`,
      description: m.replace(/\[이미지\s*\d+:\s*/, '').replace(']', '').trim(),
    }));

    return NextResponse.json({
      title,
      body,
      charCount,
      compliance,
      imageGuidelines: {
        recommendedCount: Math.max(6, placementHints.length),
        placementHints,
        altTextSuggestions: [keyword, `${keyword} 치료`, `${hospitalType} ${keyword}`, `${keyword} 증상`, `${keyword} 방법`, `${keyword} 관리`],
      },
      seoAnalysis: {
        keywordCount,
        h2Count,
        h3Count,
        estimatedReadingTime,
        structureScore,
      },
    });
  } catch (error) {
    console.error('본문 생성 오류:', error);
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return NextResponse.json({ error: `본문 생성 실패: ${message}` }, { status: 500 });
  }
}
