alter table public.observations
  add column meal_period text check (meal_period in ('아침', '점심', '저녁')),
  add column urination text check (urination in ('정상', '잦음', '배뇨 어려움', '요실금', '미확인')),
  add column pain text check (pain in ('없음', '가벼움', '중간', '심함', '미확인')),
  add column skin text check (skin in ('이상 없음', '붉어짐', '상처', '부종', '미확인')),
  add column sleep text check (sleep in ('숙면', '중간에 깸', '수면 부족', '낮잠 많음', '미확인')),
  add column mood text check (mood in ('안정', '즐거움', '불안', '우울·무기력', '화남·초조', '미확인')),
  add column cognition text check (cognition in ('평소와 같음', '혼돈', '반복 질문', '시간·장소 혼동', '미확인')),
  add column communication text check (communication in ('원활', '반복 설명 필요', '의사표현 어려움', '거의 반응 없음', '미확인')),
  add column hygiene text check (hygiene in ('스스로 함', '지켜보기', '일부 도움', '전적 도움', '미실시')),
  add column oral_care text check (oral_care in ('스스로 함', '지켜보기', '일부 도움', '전적 도움', '미실시')),
  add column medication text check (medication in ('복용 완료', '일부 복용', '복용 거부', '해당 없음', '미확인')),
  add column activity text check (activity in ('적극 참여', '보통', '소극적', '참여 거부', '미실시')),
  add column emotional_support text check (emotional_support in ('대화·말벗', '격려·안심', '가족 연락 지원', '함께 활동', '미실시'));

alter table public.observations drop constraint observations_meal_check;
alter table public.observations add constraint observations_meal_check
  check (meal in ('전량', '3/4', '절반', '1/4', '절반 이상', '절반 미만', '드시지 않음', '미확인'));

alter table public.observations drop constraint observations_water_check;
alter table public.observations add constraint observations_water_check
  check (water in ('충분', '보통', '적음', '거부', '평소보다 많음', '평소와 비슷함', '평소보다 적음', '미확인'));

alter table public.observations drop constraint observations_walking_check;
alter table public.observations add constraint observations_walking_check
  check (walking in ('스스로 이동', '혼자 걸음', '보조기 사용', '부축 필요', '휠체어·이동 불가', '걷지 않음', '미확인'));

comment on table public.observations is '돌봄 관찰 기록. 기존 기록 호환을 위해 2026-11-16에 추가된 열은 nullable이며 앱에서 새 기록의 전체 항목을 필수로 검사한다.';
