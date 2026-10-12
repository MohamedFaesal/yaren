CREATE TABLE surgical_procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  category text NOT NULL CHECK (length(btrim(category)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users (id),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX surgical_procedures_name_active_idx
  ON surgical_procedures (lower(name))
  WHERE deleted_at IS NULL;

INSERT INTO surgical_procedures (name, category)
SELECT seed.name, seed.category
FROM (
  VALUES
    ('Wound dressing', 'Wound care'),
    ('Wound irrigation', 'Wound care'),
    ('Burn dressing', 'Wound care'),
    ('Abscess dressing', 'Wound care'),
    ('Simple suture', 'Suturing'),
    ('Suture removal', 'Suturing'),
    ('Staple removal', 'Suturing'),
    ('Incision and drainage', 'Minor surgery'),
    ('Foreign body removal', 'Minor surgery'),
    ('Nail avulsion', 'Minor surgery'),
    ('Ingrown toenail removal', 'Minor surgery'),
    ('Ear irrigation', 'ENT'),
    ('Foreign body ear removal', 'ENT'),
    ('Nasal packing', 'ENT'),
    ('Epistaxis control', 'ENT'),
    ('Foreign body eye removal', 'Eye'),
    ('Eye irrigation', 'Eye'),
    ('Urinary catheter insertion', 'Lines & drainage'),
    ('Urinary catheter removal', 'Lines & drainage'),
    ('IV cannula insertion', 'Lines & drainage'),
    ('IV cannula removal', 'Lines & drainage'),
    ('Splint application', 'Orthopedic'),
    ('Bandage application', 'Orthopedic'),
    ('Nebulizer treatment', 'Airway & breathing'),
    ('Oxygen therapy', 'Airway & breathing')
) AS seed(name, category)
WHERE NOT EXISTS (
  SELECT 1
  FROM surgical_procedures existing
  WHERE existing.deleted_at IS NULL
    AND lower(existing.name) = lower(seed.name)
);
