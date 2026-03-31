import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicClient, MODEL } from '@/lib/anthropic';
import { MEDICAL_COMPLIANCE_SYSTEM_PROMPT } from '@/lib/medical-compliance';
import type { BlogTitle } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const { keyword, hospitalType } = await req.json();

    if (!keyword || typeof keyword !== 'string') {
      return NextResponse.json({ error: '키워드를 입력해주세요.' }, { status: 400 });
    }

    const systemPrompt = `당신은 네이버 블로그 SEO 및 의료 마케팅 전문가입니다.
네이버 C-Rank와 D.I.A+ 알고리즘에 최적화된 병원 블로그 제목을 생성합니다.

${MEDICAL_COMPLIANCE_SYSTEM_PROMPT}

【네이버 블로그 제목 SEO 원칙】
- 핵심 키워드를 제목 앞부분(첫 5자 이내)에 배치
- 25~35자 사이의 적절한 길이 (스니펫 절단 방지)
- 다양한 형식 활용: 질문형/정보형/가이드형/노하우형/숫자형
- 검색 의도(정보 탐색, 증상 파악, 치료 방법)를 반영
- 클릭 유도 요소 포함 (숫자, 방법, 이유, 특징, 비결, 가이드)
- 롱테일 키워드 변형 활용으로 다양한 검색 커버`;

    const userPrompt = `다음 키워드로 네이버 상위노출에 최적화된 병원 블로그 제목 5개를 생성하세요.

키워드: "${keyword}"
병원 유형: ${hospitalType || '일반 병원'}

각 제목은 서로 다른 형식으로 작성:
1. 질문형: "~는 왜? / ~는 무엇?" (검색자의 궁금증 자극)
2. 정보형: "~란? / ~의 모든 것" (정보 제공 의도)
3. 가이드형: "~하는 방법 N가지" (실용적 정보)
4. 노하우형: "~할 때 알아야 할 것" (전문성 강조)
5. 숫자형: "N가지 ~" (구체적 정보 제공)

의료광고법 완전 준수 필수.

반드시 다음 JSON 형식으로만 응답:
{
  "titles": [
    {
      "id": "1",
      "title": "제목 (25~35자)",
      "seoScore": 85,
      "keyword": "${keyword}",
      "seoDetails": {
        "keywordPlacement": 90,
        "titleLength": 85,
        "clickability": 80,
        "compliance": 100,
        "format": "질문형",
        "explanation": "키워드가 제목 앞에 위치하고 궁금증을 자극하여 클릭률이 높습니다"
      }
    }
  ]
}`;

    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textContent = response.content.find((b) => b.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json({ error: '응답 생성에 실패했습니다.' }, { status: 500 });
    }

    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'JSON 형식 응답을 찾을 수 없습니다.' }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]) as { titles: BlogTitle[] };
    return NextResponse.json(parsed);
  } catch (error) {
    console.error('제목 생성 오류:', error);
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return NextResponse.json({ error: `제목 생성 실패: ${message}` }, { status: 500 });
  }
}
