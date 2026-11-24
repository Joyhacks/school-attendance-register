-- Attendance system schema.
-- Works on MySQL 8 and on MariaDB 10.4+ (the "MySQL" that ships with XAMPP).
-- npm run setup runs this file for you. You can also import it in phpMyAdmin.

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name     VARCHAR(120) NOT NULL,
  email         VARCHAR(190) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  role          ENUM('admin', 'lecturer') NOT NULL DEFAULT 'lecturer',
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS students (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  matric_no   VARCHAR(40) NOT NULL,
  full_name   VARCHAR(120) NOT NULL,
  department  VARCHAR(100) NOT NULL,
  level       VARCHAR(30) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_students_matric (matric_no),
  KEY idx_students_name (full_name),
  KEY idx_students_dept_level (department, level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS courses (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code            VARCHAR(20) NOT NULL,
  title           VARCHAR(150) NOT NULL,
  lecturer_id     INT UNSIGNED NULL,
  -- Minimum attendance (percent) a student needs in this course.
  min_attendance  TINYINT UNSIGNED NOT NULL DEFAULT 75,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_courses_code (code),
  KEY idx_courses_lecturer (lecturer_id),
  CONSTRAINT fk_courses_lecturer FOREIGN KEY (lecturer_id)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS enrollments (
  course_id   INT UNSIGNED NOT NULL,
  student_id  INT UNSIGNED NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (course_id, student_id),
  KEY idx_enrollments_student (student_id),
  CONSTRAINT fk_enrollments_course FOREIGN KEY (course_id)
    REFERENCES courses (id) ON DELETE CASCADE,
  CONSTRAINT fk_enrollments_student FOREIGN KEY (student_id)
    REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per class held. "period" separates two classes of the same
-- course on the same day. The unique key also stops a double click
-- from creating the same class twice.
CREATE TABLE IF NOT EXISTS class_sessions (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  course_id     INT UNSIGNED NOT NULL,
  session_date  DATE NOT NULL,
  period        TINYINT UNSIGNED NOT NULL DEFAULT 1,
  topic         VARCHAR(200) NULL,
  created_by    INT UNSIGNED NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_course_date_period (course_id, session_date, period),
  CONSTRAINT fk_sessions_course FOREIGN KEY (course_id)
    REFERENCES courses (id) ON DELETE CASCADE,
  CONSTRAINT fk_sessions_creator FOREIGN KEY (created_by)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One mark per student per class.
CREATE TABLE IF NOT EXISTS attendance_records (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id  INT UNSIGNED NOT NULL,
  student_id  INT UNSIGNED NOT NULL,
  status      ENUM('present', 'absent', 'late', 'excused') NOT NULL,
  marked_by   INT UNSIGNED NULL,
  marked_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_records_session_student (session_id, student_id),
  KEY idx_records_student (student_id),
  CONSTRAINT fk_records_session FOREIGN KEY (session_id)
    REFERENCES class_sessions (id) ON DELETE CASCADE,
  CONSTRAINT fk_records_student FOREIGN KEY (student_id)
    REFERENCES students (id) ON DELETE CASCADE,
  CONSTRAINT fk_records_marker FOREIGN KEY (marked_by)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Login sessions (who is signed in). Managed by the server.
CREATE TABLE IF NOT EXISTS login_sessions (
  sid         VARCHAR(128) NOT NULL,
  user_id     INT UNSIGNED NULL,
  data        TEXT NOT NULL,
  expires_at  DATETIME NOT NULL,
  PRIMARY KEY (sid),
  KEY idx_login_sessions_user (user_id),
  KEY idx_login_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Values the system keeps for itself, such as the generated session
-- secret on a hosted install.
CREATE TABLE IF NOT EXISTS app_settings (
  name        VARCHAR(64) NOT NULL,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
