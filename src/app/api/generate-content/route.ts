import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicClient, MODEL } from '@/lib/anthropic';
import { MEDICAL_COMPLIANCE_SYSTEM_PROMPT, checkCompliance } from '@/lib/medical-compliance';

export async function POST(req: NextRequest) {
  try {
    const { title, keyword, hospitalType, additionalInfo } = await req.json();

    if (!title || !keyword) {
      return NextResponse.json({ error: '제목과 키워드를 입력해주세요.' }, { status: 400 });
    }

    const systemPrompt = `당신은 네이버 블로그를 10년째 운영하는 병원 실장입니다.
딱딱한 의료 정보가 아니라, 실제로 환자분들이 검색해서 읽고 "맞아, 나 얘기네" 하고 느낄 수 있는 글을 씁니다.

${MEDICAL_COMPLIANCE_SYSTEM_PROMPT}

【절대 금지 - 반드시 지킬 것】
- #, ##, ###, **텍스트**, *텍스트*, ---, ***, ~~~, == 등 마크다운 기호 절대 사용 금지
- 볼드, 이탤릭 서식 기호 절대 사용 금지
- 목록 기호(-, *, •, 1.) 절대 사용 금지
- 이모지 사용 금지
- AI가 쓴 것처럼 보이는 표현 금지: "먼저", "또한", "따라서", "이처럼", "정리하자면", "중요한 것은", "핵심은", "결론적으로"

【사람처럼 쓰는 원칙】
- 소제목은 검색하는 사람 입장에서 궁금할 법한 말투로 (예: "허리가 왜 이렇게 오래 아픈 걸까요?")
- 소제목 앞뒤 빈 줄로만 구분, 기호 없음
- 문장마다 시작 방식을 다르게 (같은 패턴 반복 금지)
- 짧은 문장과 긴 문장을 불규칙하게 섞기
- 실제 환자가 말할 법한 표현 사용 (예: "아, 이거 나 얘기네", "솔직히", "생각보다", "의외로")
- 단락은 2~4문장으로 자연스럽게 끊기
- 너무 완벽하게 구성하지 말 것 (자연스러운 흐름이 더 중요)`;

    const userPrompt = `아래 제목으로 네이버 블로그 본문을 써주세요. 병원에서 실제로 일하는 사람이 쓴 것처럼, 자연스럽고 편하게 읽히는 글이어야 합니다.

제목: "${title}"
핵심 키워드: "${keyword}"
병원 유형: ${hospitalType || '일반 병원'}
추가 정보: ${additionalInfo || '없음'}

【작성 조건】
- 총 1,400~1,600자 (공백 포함)
- 의료광고법 준수 (완치, 최고, 100% 등 표현 금지)
- 소제목 4~5개 (기호 없이, 한 줄, 자연스러운 말투)
- 키워드 "${keyword}" 3~5회 자연스럽게 포함
- 각 소제목 아래 단락 2~3개 (2~4문장씩)
- 이미지 위치는 [이미지 N: 설명] 형식으로 소제목 아래 표시 (총 5~6개)
- 흐름: 공감/도입 → 원인 → 증상 → 치료·관리 → 예방·생활습관 → 마무리
- 마지막 문장: "개인마다 차이가 있을 수 있으니, 전문의와 상담 후 결정하시길 권해드립니다."

【절대 쓰지 말 것】
- "먼저", "또한", "따라서", "이처럼", "정리하자면", "중요한 것은", "결론적으로" 같은 AI 티 나는 표현
- # ## ** * - 등 마크다운 기호
- 모든 단락을 같은 방식으로 시작하는 것

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

    const rawBody = textContent.text;
    // 마크다운 기호 제거 (AI 감지 방지)
    const body = rawBody
      .replace(/^#{1,6}\s+/gm, '')           // # ## ### 헤더
      .replace(/\*\*(.+?)\*\*/gs, '$1')      // **볼드** (멀티라인 포함)
      .replace(/__(.+?)__/gs, '$1')          // __볼드__
      .replace(/\*(.+?)\*/gs, '$1')          // *이탤릭*
      .replace(/_(.+?)_/gs, '$1')            // _이탤릭_
      .replace(/~~(.+?)~~/gs, '$1')          // ~~취소선~~
      .replace(/^[-*]{3,}\s*$/gm, '')        // --- *** 구분선
      .replace(/^[\s]*[-*+]\s+/gm, '')       // 목록 기호 (- * +)
      .replace(/^\d+\.\s+/gm, '')            // 번호 목록 (1. 2.)
      .replace(/\*\*/g, '')                  // 남은 ** 모두 제거
      .replace(/(?<!\[이미지[^\]]*)-{2,}/g, '') // 남은 -- --- 제거 (이미지 태그 제외)
      .replace(/\n{3,}/g, '\n\n')            // 3줄 이상 빈줄 → 2줄로
      .trim();
    const charCount = body.replace(/\[이미지\s*\d+:[^\]]*\]/g, '').length;
    const compliance = checkCompliance(body);

    // SEO 분석
    const paragraphCount = (body.split(/\n\n+/).filter(p => p.trim().length > 20)).length;
    const keywordCount = (body.toLowerCase().split(keyword.toLowerCase()).length - 1);
    const estimatedReadingTime = Math.ceil(charCount / 500);
    const structureScore = Math.min(100, paragraphCount * 8 + (keywordCount >= 3 && keywordCount <= 6 ? 30 : 10));
    const h2Count = paragraphCount;
    const h3Count = 0;

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
