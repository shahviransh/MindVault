use crate::error::{AppError, AppResult};
use crate::policy::validate_minutes;
use crate::store::Schedule;
use chrono::{Datelike, Duration, NaiveDateTime, NaiveTime};

pub const MAX_SCHEDULES: usize = 12;

pub struct Due {
    pub schedule: Schedule,
    pub minutes_left: u32,
    pub mark: String,
}

fn start_time(schedule: &Schedule) -> Option<NaiveTime> {
    NaiveTime::parse_from_str(&schedule.start, "%H:%M").ok()
}

pub fn validate(list: &[Schedule]) -> AppResult<Vec<Schedule>> {
    if list.len() > MAX_SCHEDULES {
        return Err(AppError::Message(format!("Keep it to {MAX_SCHEDULES} schedules or fewer.")));
    }
    let mut clean: Vec<Schedule> = Vec::with_capacity(list.len());
    for item in list {
        let id = item.id.trim();
        if id.is_empty()
            || id.len() > 40
            || !id.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
        {
            return Err(AppError::Message("Each schedule needs a short id.".into()));
        }
        if clean.iter().any(|other| other.id == id) {
            return Err(AppError::Message("Schedule ids must be unique.".into()));
        }
        let mut days: Vec<u8> = item.days.iter().copied().filter(|day| *day <= 6).collect();
        days.sort_unstable();
        days.dedup();
        if days.is_empty() || days.len() != item.days.iter().collect::<std::collections::HashSet<_>>().len() {
            return Err(AppError::Message("Pick at least one valid day for each schedule.".into()));
        }
        if start_time(item).is_none() {
            return Err(AppError::Message("Schedule start times use HH:MM.".into()));
        }
        validate_minutes(item.minutes)?;
        clean.push(Schedule {
            id: id.to_string(),
            days,
            start: item.start.clone(),
            minutes: item.minutes,
            level: item.level,
        });
    }
    Ok(clean)
}

/// The schedule whose window contains `now` and has not fired for that window yet.
/// Windows can cross midnight, so yesterday's start is checked too.
pub fn due(list: &[Schedule], fired: &[String], now: NaiveDateTime) -> Option<Due> {
    for schedule in list {
        let Some(time) = start_time(schedule) else {
            continue;
        };
        for back in 0..=1 {
            let day = now.date() - Duration::days(back);
            let weekday = day.weekday().num_days_from_monday() as u8;
            if !schedule.days.contains(&weekday) {
                continue;
            }
            let begin = day.and_time(time);
            let end = begin + Duration::minutes(schedule.minutes as i64);
            if now < begin || now >= end {
                continue;
            }
            let mark = format!("{}@{}", schedule.id, day.format("%Y-%m-%d"));
            if fired.contains(&mark) {
                continue;
            }
            let seconds = (end - now).num_seconds().max(0);
            let minutes_left = ((seconds + 59) / 60).clamp(1, schedule.minutes as i64) as u32;
            return Some(Due {
                schedule: schedule.clone(),
                minutes_left,
                mark,
            });
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::policy::Level;
    use chrono::NaiveDate;

    fn at(y: i32, m: u32, d: u32, h: u32, min: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(y, m, d).unwrap().and_hms_opt(h, min, 0).unwrap()
    }

    fn weekday_morning() -> Schedule {
        Schedule {
            id: "morning".into(),
            days: vec![0, 1, 2, 3, 4],
            start: "09:00".into(),
            minutes: 180,
            level: Level::Standard,
        }
    }

    #[test]
    fn validation_keeps_the_eight_hour_cap() {
        let mut long = weekday_morning();
        long.minutes = 481;
        assert!(validate(&[long]).is_err());
        let mut bad_time = weekday_morning();
        bad_time.start = "25:00".into();
        assert!(validate(&[bad_time]).is_err());
        let mut no_days = weekday_morning();
        no_days.days = vec![];
        assert!(validate(&[no_days]).is_err());
        let mut bad_day = weekday_morning();
        bad_day.days = vec![7];
        assert!(validate(&[bad_day]).is_err());
        assert!(validate(&[weekday_morning(), weekday_morning()]).is_err());
        assert!(validate(&[weekday_morning()]).is_ok());
    }

    #[test]
    fn due_only_inside_the_window_on_listed_days() {
        let list = [weekday_morning()];
        // 2026-10-21 is a Wednesday.
        assert!(due(&list, &[], at(2026, 10, 21, 8, 59)).is_none());
        let hit = due(&list, &[], at(2026, 10, 21, 10, 30)).unwrap();
        assert_eq!(hit.minutes_left, 90);
        assert_eq!(hit.mark, "morning@2026-10-21");
        assert!(due(&list, &[], at(2026, 10, 21, 12, 0)).is_none());
        // Saturday.
        assert!(due(&list, &[], at(2026, 10, 24, 10, 0)).is_none());
    }

    #[test]
    fn fires_once_per_window() {
        let list = [weekday_morning()];
        let fired = vec!["morning@2026-10-21".to_string()];
        assert!(due(&list, &fired, at(2026, 10, 21, 10, 0)).is_none());
        assert!(due(&list, &fired, at(2026, 10, 22, 10, 0)).is_some());
    }

    #[test]
    fn windows_can_cross_midnight() {
        let late = Schedule {
            id: "late".into(),
            days: vec![2],
            start: "23:00".into(),
            minutes: 120,
            level: Level::Light,
        };
        let hit = due(&[late], &[], at(2026, 10, 22, 0, 30)).unwrap();
        assert_eq!(hit.mark, "late@2026-10-21");
        assert_eq!(hit.minutes_left, 30);
    }
}
