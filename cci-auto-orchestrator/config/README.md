# Configuration Files / 설정 파일

## Purpose / 목적
CCI 자동화 프로그램의 설정 및 데이터 파일을 관리합니다.

## Files / 파일 설명

### Core Settings (핵심 설정)
- **company_members.json**: 회사 구성원 정보
- **employees.json**: 직원 정보
- **users.json**: 사용자 정보

### Integration & Rules (연동 및 규칙)
- **assets.json**: 자산 정보
- **conversion_rules.json**: 데이터 변환 규칙
- **manage_schedules.json**: 스케줄 관리 설정

### Device Configuration (기기 설정)
- **devices.json**: 기기 정보 (운영 중)
- **samples/devices.ios.sample.json**: iOS 기기 샘플 데이터 (테스트용)

## Notes / 주의사항
- runtime/ 폴더의 파일들은 프로그램 실행 중 자동으로 생성/갱신됩니다
- 민감한 정보는 .gitignore에 의해 Git에 저장되지 않습니다
